/**
 * Pipeline de mensagens recebidas no WhatsApp.
 * Server-only: usa supabaseAdmin (bypass RLS para webhook).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  searchGuataKnowledgeBase,
  getGuataPersona,
  listDescubraEvents,
  isDescubraConfigured,
} from "@/integrations/descubra/admin.server";
import { chatCompletion } from "@/lib/ai-gateway.server";
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppAudio,
  markReadAndTyping,
  typingDelayMs,
} from "@/lib/meta-send.server";
import {
  handleBotAudioPreferenceMessage,
  readBotAudioPrefs,
  shouldSendAudioReply,
} from "@/lib/bot-audio-preference.server";
import {
  getOrgBotAudioPolicy,
  orgCanSendTtsNow,
  recordOrganizationTtsUsage,
  defaultIntakeForNewSession,
} from "@/lib/bot-audio-org.server";
import { isBotTtsConfigured, plainTextForSpeech, synthesizeBotSpeech } from "@/lib/tts.server";
import { signedChatMediaUrl, storeChatMedia } from "@/lib/chat-media.server";
import { formatForWhatsApp, splitWhatsAppMessages } from "@/lib/whatsapp-messages.server";
import {
  detectLeadStage,
  leadStagePromptSection,
  mergeLeadStage,
  type LeadStage,
} from "@/lib/lead-stage.server";
import { ensureTravelIntakeForSession } from "@/lib/lead-intake.server";
import {
  getGuataOrganizationId,
  organizationUsesDescubra,
} from "@/lib/organizations.server";

/** Nome comercial da agência (não usar razão social completa no WhatsApp). */
export const AGENCY_NAME = "Guatá Viagens";

export interface IncomingMessage {
  organizationId: string;
  line: "descubra" | "viagens";
  phone: string;
  contactName?: string;
  text: string;
  messageId?: string;
  inboundKind?: "text" | "image" | "audio" | "unsupported";
  mediaPath?: string;
  mediaMime?: string;
  mediaKind?: "image" | "audio" | "video" | "document";
}

interface SessionRow {
  id: string;
  mode: "bot" | "humano" | "triagem" | "aguardando";
  intake_state: string | null;
  intake_data: Record<string, unknown>;
}

function leadStageFromData(data: Record<string, unknown> | undefined): LeadStage {
  const s = data?.["lead_stage"];
  if (s === "qualificando" || s === "quente" || s === "informacional") return s;
  return "informacional";
}

async function countUserTurns(sessionId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("author", "user");
  return count ?? 0;
}

function mayTravelHookInReply(text: string): boolean {
  return /\b(monte isso para você|monte (essa|a) viagem|Guatá Viagens monte)\b/i.test(text);
}

async function refreshLeadStage(
  session: SessionRow,
  userText: string,
): Promise<LeadStage> {
  const turns = await countUserTurns(session.id);
  const detected = detectLeadStage(userText, turns);
  const lead_stage = mergeLeadStage(leadStageFromData(session.intake_data), detected);
  const intake_data = {
    ...(session.intake_data ?? {}),
    lead_stage,
    lead_updated_at: new Date().toISOString(),
  };
  await supabaseAdmin
    .from("sessions")
    .update({ intake_data: intake_data as never })
    .eq("id", session.id);
  session.intake_data = intake_data;
  return lead_stage;
}

async function loadOrCreateSession(
  organizationId: string,
  line: "descubra" | "viagens",
  phone: string,
  contactName?: string,
): Promise<SessionRow> {
  const { data: existing } = await supabaseAdmin
    .from("sessions")
    .select("id, mode, intake_state, intake_data")
    .eq("organization_id", organizationId)
    .eq("line", line)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing as unknown as SessionRow;
  const organization_id = organizationId;
  const intake_data = await defaultIntakeForNewSession(organizationId);
  const { data: created, error } = await supabaseAdmin
    .from("sessions")
    .insert({
      line,
      phone,
      contact_name: contactName ?? null,
      mode: "bot",
      organization_id,
      ...(Object.keys(intake_data).length > 0 ? { intake_data: intake_data as never } : {}),
    })
    .select("id, mode, intake_state, intake_data")
    .single();
  if (error) throw new Error(error.message);
  return created as unknown as SessionRow;
}

async function persistMessage(
  sessionId: string,
  direction: "in" | "out",
  author: "user" | "bot" | "agent" | "system",
  text: string,
  metadata?: Record<string, unknown>,
) {
  await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction,
    author,
    text,
    ...(metadata ? { metadata: metadata as never } : {}),
  });
  await supabaseAdmin
    .from("sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
}

const INTAKE_STEPS = [
  "origem",
  "destino",
  "datas",
  "pax",
  "orcamento",
  "preferencias",
] as const;
type IntakeStep = (typeof INTAKE_STEPS)[number];

const STEP_PROMPT: Record<IntakeStep, string> = {
  origem: "De qual cidade você está saindo?",
  destino: "Qual destino te interessa?",
  datas: "Quais as datas previstas? (ida e volta)",
  pax: "Quantas pessoas vão viajar? (adultos e crianças)",
  orcamento: "Qual orçamento aproximado por pessoa?",
  preferencias: "Alguma preferência (hotel, voo, atividades)?",
};

async function startIntake(
  sessionId: string,
  keepData: Record<string, unknown> = {},
): Promise<string> {
  await supabaseAdmin
    .from("sessions")
    .update({
      mode: "triagem",
      intake_state: "origem",
      intake_data: { ...keepData, triagem_at: new Date().toISOString() },
    })
    .eq("id", sessionId);
  return `Vamos montar sua viagem com a ${AGENCY_NAME}! ${STEP_PROMPT.origem}\n\n(digite "menu" para voltar ao Guatá)`;
}

async function continueIntake(
  session: SessionRow,
  userText: string,
): Promise<string> {
  const step = (session.intake_state ?? "origem") as IntakeStep;
  const data: Record<string, unknown> = {
    ...(session.intake_data ?? {}),
    [step]: userText,
  };
  const idx = INTAKE_STEPS.indexOf(step);
  const next = INTAKE_STEPS[idx + 1];

  if (next) {
    await supabaseAdmin
      .from("sessions")
      .update({ intake_state: next, intake_data: data as never })
      .eq("id", session.id);
    return STEP_PROMPT[next];
  }

  // Finaliza triagem
  const { data: proto } = await supabaseAdmin.rpc("generate_protocol");
  const protocol = (proto as string) ?? `VG-${Date.now().toString().slice(-4)}`;

  await supabaseAdmin.from("travel_intake").insert({
    session_id: session.id,
    protocol,
    origem: String(data.origem ?? ""),
    destino: String(data.destino ?? ""),
    preferencias: data as never,
    status: "novo",
  });
  await supabaseAdmin
    .from("sessions")
    .update({
      mode: "aguardando",
      intake_state: null,
      intake_data: {
        ...(session.intake_data ?? {}),
        lead_stage: "quente",
        triagem_protocol: protocol,
      } as never,
    })
    .eq("id", session.id);

  return `Triagem registrada! Protocolo ${protocol}. Um consultor da ${AGENCY_NAME} entrará em contato em breve.`;
}

interface AttendantConfig {
  persona: string;
  criatividade: number;
  modelo: string;
  usa_base_local: boolean;
  usa_base_descubra: boolean;
}

async function loadAttendant(
  line: "descubra" | "viagens",
  organizationId: string,
): Promise<AttendantConfig | null> {
  const { data } = await supabaseAdmin
    .from("attendants")
    .select("persona, criatividade, modelo, usa_base_local, usa_base_descubra")
    .eq("line", line)
    .eq("organization_id", organizationId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return (data as unknown as AttendantConfig) ?? null;
}

async function sessionOrganizationId(sessionId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("organization_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (data?.organization_id) return data.organization_id as string;
  return getGuataOrganizationId();
}

const GUATA_CORE_PERSONA = `Você é o Guatá (masculino: ele/o Guatá, nunca feminino): natural de Mato Grosso do Sul (MS é sua casa), espírito de aventureiro, caloroso e direto.
- Priorize MS (destinos, cultura, gastronomia, eventos, roteiros) quando couber no assunto.
- Pode orientar sobre turismo em outros lugares do mundo com informação útil; MS continua sendo sua referência e orgulho.
- Pacotes, reservas, orçamentos e viagens sob medida: cite a agência ${AGENCY_NAME} (sempre exatamente esse nome).
- NUNCA diga que não pode ajudar com viagem personalizada ou destino fora de MS — acolha e convide a ${AGENCY_NAME} a montar.`;

/** Remove scripts de menu/apresentação do Me Consulte; mantém fatos úteis da persona oficial. */
function refineOfficialPersona(official: string): string {
  let t = official;
  t = t.replace(/🦦[\s\S]*?(?:Mato Grosso do Sul|MS)\s*\?/gi, "");
  t = t.replace(
    /Posso te ajudar com informações sobre destinos, atrações, gastronomia[\s\S]*?roteiros turísticos em MS\.?/gi,
    "",
  );
  t = t.replace(
    /O que você gostaria de saber sobre turismo em Mato Grosso do Sul\s*\??/gi,
    "",
  );
  t = t.replace(/Eu sou o Guatá,?\s*seu guia inteligente[\s\S]*?MS\.?/gi, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function buildSystemPersona(
  line: "descubra" | "viagens",
  official: string | null,
  attendant: AttendantConfig | null,
): string {
  const fallback =
    attendant?.persona ||
    `Você é o Guatá, assistente turístico com coração em MS. Respostas curtas e úteis. Viagens sob medida: ${AGENCY_NAME}.`;
  const institutional =
    line === "descubra" && official
      ? `\n\n## Referência institucional (fatos e tom MS — não copie menus nem apresentações fixas):\n${refineOfficialPersona(official)}`
      : "";
  return GUATA_CORE_PERSONA + institutional + (attendant?.persona ? `\n\n## Atendente:\n${attendant.persona}` : `\n\n${fallback}`);
}

async function loadHistory(
  sessionId: string | undefined,
  userText: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  if (!sessionId) return [{ role: "user", content: userText }];
  const { data } = await supabaseAdmin
    .from("messages")
    .select("author, text")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(12);
  const hist = (data ?? []).reverse().map((m) => ({
    role: (m.author === "user" ? "user" : "assistant") as "user" | "assistant",
    content: m.text,
  }));
  const last = hist[hist.length - 1];
  if (!last || last.role !== "user" || last.content !== userText) {
    hist.push({ role: "user", content: userText });
  }
  return hist;
}

async function answerTurismo(
  userText: string,
  line: "descubra" | "viagens",
  sessionId?: string,
  firstName?: string,
  leadStage: LeadStage = "informacional",
  intakeData?: Record<string, unknown>,
): Promise<string> {
  const orgId = sessionId ? await sessionOrganizationId(sessionId) : await getGuataOrganizationId();
  const attendant = await loadAttendant(line, orgId);
  const descubraAllowed = await organizationUsesDescubra(orgId);
  const official =
    line === "descubra" && descubraAllowed ? await getGuataPersona() : null;
  const persona = buildSystemPersona(line, official, attendant);

  let context = "";

  // Base de conhecimento própria (documentos, textos e links anexados no painel)
  const { listSendableKnowledgeForPrompt } = await import("@/lib/knowledge.server");
  const sendableCatalog = await listSendableKnowledgeForPrompt(orgId).catch(() => []);

  if (attendant?.usa_base_local !== false) {
    const { searchLocalKnowledge } = await import("@/lib/knowledge.server");
    const local = await searchLocalKnowledge(userText, 3, orgId).catch(() => []);
    if (local.length > 0) {
      context +=
        "\n\nDocumentos da empresa (use como fonte principal):\n" +
        local.map((d) => `### ${d.title}\n${d.excerpt}`).join("\n\n");
    }
  }

  const kb =
    !descubraAllowed || attendant?.usa_base_descubra === false
      ? []
      : await searchGuataKnowledgeBase(userText, 3);
  if (kb.length > 0) {
    context +=
      "\n\nBase de conhecimento Descubra MS:\n" +
      kb.map((k) => `- ${k.question}: ${k.answer}`).join("\n");
  } else if (!context && descubraAllowed && isDescubraConfigured()) {
    const events = await listDescubraEvents(8);
    if (events.length > 0) {
      context =
        "\n\nEventos próximos em MS:\n" +
        events
          .slice(0, 5)
          .map(
            (e) =>
              `- ${e.title}${e.starts_at ? ` (${e.starts_at.slice(0, 10)})` : ""}${e.city ? ` — ${e.city}` : ""}`,
          )
          .join("\n");
    }
  }

  const history = await loadHistory(sessionId, userText);
  const ongoing = history.length > 1;
  const travelHookSent = Boolean(intakeData?.["travel_hook_sent"]);
  const userTurns = history.filter((h) => h.role === "user").length;
  const mayOfferTravelHook =
    !travelHookSent &&
    userTurns >= 2 &&
    /\b(punta cana|canc[uú]n|europa|disney|paris|maldivas|orlando|caribe|exterior|internacional|miami|cruzeiro)\b/i.test(
      userText,
    );
  const whatsappRules =
    "\n\n## IDIOMA\n- Responda SEMPRE no mesmo idioma da última mensagem do cliente (português, inglês, espanhol etc.).\n" +
    `\n## CONVERSA E ASSUNTO\n- Responda PRIMEIRO o que o cliente perguntou (MS ou qualquer destino). Use o histórico: perguntas de follow-up continuam o mesmo tema.\n- PROIBIDO: apresentação longa, emoji 🦦, menu "o que você gostaria de saber sobre turismo em MS", ou repetir "sou o Guatá, guia inteligente" quando já há pergunta concreta ou conversa em andamento.\n- MS é sua casa — destaque MS quando relevante; em assuntos internacionais, seja útil e breve e só então ligue à ${AGENCY_NAME} se for viagem sob medida.\n- Parceiros Descubra MS no contexto podem ser recomendados.\n` +
    `\n## CONSULTOR HUMANO\n- NUNCA transfira por conta própria. Só ofereça um consultor quando o cliente demonstrar intenção clara de comprar/reservar/fechar, ou quando você realmente não souber resolver.\n- Ao oferecer, PERGUNTE (ex.: 'Quer que eu chame um consultor da ${AGENCY_NAME}?') e termine com [[OFERTA_HUMANO]].\n` +
    "\n## CANAL WHATSAPP\n- Responda de forma completa ao que o cliente pediu (biografias, roteiros, listas). Desenvolva o assunto até esclarecer a dúvida.\n- Se a base citar \"Link para o cliente:\" ou um URL (vídeo, site, roteiro), inclua o link completo https://... na resposta para o cliente abrir no celular.\n- Pode usar vários parágrafos e listas com '• ' quando fizer sentido. Sem menus numerados.\n- Tom natural. NÃO use markdown (sem ** ou ##). Destaque com no máximo *uma* palavra em asterisco por trecho.\n- O Guatá é masculino: fale de si como eu/o Guatá/dele, nunca ela/a Guatá como pessoa.\n" +
    (ongoing
      ? "- A conversa JÁ está em andamento: NÃO cumprimente de novo (sem 'Olá', 'Oi', 'Que pergunta ótima'). Vá direto ao ponto.\n"
      : "- Se for só um cumprimento, cumprimente uma vez (sem textão) e pergunte como pode ajudar.\n") +
    (firstName
      ? `- O cliente se chama ${firstName}. Use o primeiro nome de forma natural, no máximo uma vez, sem repetir em toda mensagem.\n`
      : "") +
    leadStagePromptSection(leadStage, AGENCY_NAME, { mayOfferTravelHook }) +
    (sendableCatalog.length > 0
      ? "\n\n## MÍDIAS NO WHATSAPP\n" +
        "Se o cliente pedir promoção, cartaz, flyer ou o assunto bater com um item abaixo, você pode enviar a imagem automaticamente — termine a resposta com [[ENVIAR_MIDIA:ID]] (um ID só, da lista). Não envie mídia sem necessidade.\n" +
        sendableCatalog.map((s) => `- ${s.id}: ${s.title} — ${s.hint}`).join("\n")
      : "");

  const raw = await chatCompletion(
    [{ role: "system", content: persona + context + whatsappRules }, ...history],
    {
      maxTokens: 1400,
      temperature: attendant?.criatividade ?? 0.6,
      model: attendant?.modelo || undefined,
    },
  );
  return formatForWhatsApp(raw);
}

export { formatForWhatsApp, splitWhatsAppMessages } from "@/lib/whatsapp-messages.server";

/**
 * Processa uma mensagem recebida. Persiste e retorna o(s) texto(s) a enviar.
 */
async function deliverTextReplies(
  sessionId: string,
  phone: string,
  waTarget: { organizationId: string; line: "descubra" | "viagens" },
  replies: string[],
  intake: Record<string, unknown>,
  botMode: boolean,
  inboundKind: IncomingMessage["inboundKind"],
): Promise<void> {
  const audioPrefs = readBotAudioPrefs(intake);
  const orgPolicy = await getOrgBotAudioPolicy(waTarget.organizationId);
  const quotaOk = orgCanSendTtsNow(orgPolicy);
  const tryAudio =
    botMode &&
    orgPolicy.allowBotAudio &&
    quotaOk &&
    shouldSendAudioReply(intake, inboundKind) &&
    isBotTtsConfigured() &&
    replies.length > 0;

  for (let i = 0; i < replies.length; i++) {
    const text = replies[i];
    await persistMessage(sessionId, "out", "bot", text);

    if (i === 0 && tryAudio) {
      const speech = await synthesizeBotSpeech(text, audioPrefs.voice);
      if (speech) {
        try {
          const path = await storeChatMedia(phone, speech.bytes, speech.mimeType, "audio");
          const url = await signedChatMediaUrl(path, 60 * 60);
          if (url) {
            await new Promise((r) => setTimeout(r, typingDelayMs(text)));
            const audioRes = await sendWhatsAppAudio(waTarget, phone, url).catch(
              (e) => ({ ok: false, reason: String(e) }) as const,
            );
            if (audioRes.ok) {
              console.log("[meta] áudio enviado:", "messageId" in audioRes ? audioRes.messageId : "");
              await recordOrganizationTtsUsage(
                waTarget.organizationId,
                plainTextForSpeech(text).length,
              );
              continue;
            }
            console.error("[meta] áudio falhou:", audioRes.reason);
          }
        } catch (e) {
          console.error("[tts] envio:", e);
        }
      }
    }

    await new Promise((r) => setTimeout(r, typingDelayMs(text)));
    const res = await sendWhatsAppText(waTarget, phone, text).catch(
      (e) => ({ ok: false, reason: String(e) }) as const,
    );
    if (!res.ok) console.error("[meta] send falhou:", res.reason);
    else console.log("[meta] enviado:", "messageId" in res ? res.messageId : "");
  }
}

async function notifyOwner(msg: IncomingMessage, sessionId: string) {
  const owner = process.env["OWNER_ALERT_PHONE"] || "5567992123617";
  const { data } = await supabaseAdmin
    .from("sessions").select("dossie").eq("id", sessionId).maybeSingle();
  const d = (data?.dossie ?? {}) as Record<string, unknown>;
  const resumo = String(d["resumo"] ?? d["resumo_executivo"] ?? d["intencao"] ?? msg.text).slice(0, 400);
  const phone = msg.phone.replace(/\D/g, "");
  const text =
    `🔔 *Cliente aguardando consultor*\n` +
    `Nome: ${msg.contactName ?? "Sem nome"}\nContato: +${phone}\n` +
    `Resumo: ${resumo}\n\n` +
    `Responder pelo painel: https://guata-connect-hub.lovable.app/conversas/${sessionId}\n` +
    `Chamar pelo seu WhatsApp: https://wa.me/${phone}`;
  const orgId = await sessionOrganizationId(sessionId);
  const res = await sendWhatsAppText(
    { organizationId: orgId, line: msg.line },
    owner,
    text,
  );
  if (!res.ok) console.error("[alerta] envio falhou:", res.reason);
}

export async function processMessage(
  msg: IncomingMessage,
): Promise<{ replies: string[]; sessionId: string }> {
  const waTarget = { organizationId: msg.organizationId, line: msg.line };
  if (msg.messageId) void markReadAndTyping(waTarget, msg.messageId);
  const session = await loadOrCreateSession(
    msg.organizationId,
    msg.line,
    msg.phone,
    msg.contactName,
  );
  if (msg.contactName?.trim()) {
    await supabaseAdmin
      .from("sessions")
      .update({ contact_name: msg.contactName.trim() })
      .eq("id", session.id);
  }
  await persistMessage(session.id, "in", "user", msg.text, {
    inbound_kind: msg.inboundKind ?? "text",
    ...(msg.mediaPath
      ? {
          media_path: msg.mediaPath,
          media_mime: msg.mediaMime,
          media_kind: msg.mediaKind,
        }
      : {}),
  });
  const firstName = msg.contactName?.trim().split(/\s+/)[0];
  const handoffText = firstName
    ? `Perfeito, ${firstName}! Já avisei nosso consultor, ele vai falar com você por aqui em instantes. 😊`
    : "Perfeito! Já avisei nosso consultor, ele vai falar com você por aqui em instantes. 😊";

  const lower = msg.text.trim().toLowerCase();
  const replies: string[] = [];
  const offered = session.intake_state === "oferta_humano";

  // Destrava sessões antigas e desarquiva quando o cliente volta a falar
  await supabaseAdmin
    .from("sessions")
    .update({
      archived_at: null,
      ...(session.mode === "aguardando"
        ? { mode: "bot" as const, intake_state: null }
        : {}),
    })
    .eq("id", session.id);

  const audioPrefCmd = await handleBotAudioPreferenceMessage(
    session.id,
    session.intake_data ?? {},
    msg.text,
    msg.organizationId,
  );
  if (audioPrefCmd.handled && audioPrefCmd.prefs) {
    session.intake_data = {
      ...(session.intake_data ?? {}),
      bot_audio_text_only: audioPrefCmd.prefs.textOnly,
      bot_voice_profile: audioPrefCmd.prefs.voice,
      bot_audio_enabled: false,
    };
  }

  const explicitHuman =
    /\b(humano|atendente|consultor|falar com (uma )?pessoa|pessoa real|human agent|speak to (a )?human|hablar con (una )?persona|agente humano)\b/i.test(lower);
  const affirmative =
    /^(sim|s|quero|pode|pode sim|claro|ok|okay|por favor|bora|isso|yes|yeah|sure|sí|si|vale)\b/i.test(lower);

  const goHuman = async () => {
    const intake_data = {
      ...(session.intake_data ?? {}),
      lead_stage: "quente" as LeadStage,
      lead_updated_at: new Date().toISOString(),
    };
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano", intake_state: null, intake_data: intake_data as never })
      .eq("id", session.id);
    void ensureTravelIntakeForSession(session.id).catch((e) =>
      console.error("[lead-intake] handoff:", e),
    );
    replies.push(handoffText);
  };

  const wantsStructuredIntake =
    /\b(montar (minha )?viagem|orçamento de viagem|orcamento de viagem|fazer orçamento|fazer orcamento|quero orçamento completo|quero orcamento completo)\b/i.test(
      lower,
    );

  if (audioPrefCmd.handled && audioPrefCmd.reply) {
    replies.push(audioPrefCmd.reply);
  } else if (session.mode === "humano") {
    // Não responde — consultor responde no painel
  } else if (session.mode === "triagem" && session.intake_state && INTAKE_STEPS.includes(session.intake_state as IntakeStep)) {
    const reply = await continueIntake(session, msg.text);
    replies.push(reply);
  } else if (wantsStructuredIntake && session.mode === "bot") {
    replies.push(await startIntake(session.id, session.intake_data ?? {}));
  } else if (explicitHuman || (offered && affirmative)) {
    await goHuman();
  } else if (lower === "menu") {
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "bot", intake_state: null })
      .eq("id", session.id);
    replies.push(
      "Beleza! Voltamos ao papo com o Guatá. O que você quer saber?\n\n(Mando áudio quando você me envia voz; em texto, respondo escrito. Digite *opções de áudio* para detalhes.)",
    );
  } else {
    if (offered) {
      await supabaseAdmin.from("sessions").update({ intake_state: null }).eq("id", session.id);
    }
    try {
      const leadStage = await refreshLeadStage(session, msg.text);
      const raw = await answerTurismo(
        msg.text,
        msg.line,
        session.id,
        firstName,
        leadStage,
        session.intake_data,
      );
      const offer = raw.includes("[[OFERTA_HUMANO]]");
      const hookUsed =
        mayTravelHookInReply(raw) && leadStage !== "informacional";
      const intakePatch: Record<string, unknown> = { ...(session.intake_data ?? {}) };
      if (hookUsed) intakePatch["travel_hook_sent"] = true;
      if (offer) {
        await supabaseAdmin
          .from("sessions")
          .update({
            intake_state: "oferta_humano",
            intake_data: intakePatch as never,
          })
          .eq("id", session.id);
      } else if (hookUsed) {
        await supabaseAdmin
          .from("sessions")
          .update({ intake_data: intakePatch as never })
          .eq("id", session.id);
      }
      if (leadStage === "quente") {
        void ensureTravelIntakeForSession(session.id).catch((e) =>
          console.error("[lead-intake] quente:", e),
        );
      }

      const mediaTag = raw.match(/\[\[ENVIAR_MIDIA:([0-9a-f-]{36})\]\]/i);
      const body = raw
        .replace(/\[\[OFERTA_HUMANO\]\]/g, "")
        .replace(/\[\[ENVIAR_MIDIA:[0-9a-f-]{36}\]\]/gi, "")
        .trim();
      replies.push(...splitWhatsAppMessages(body));
      if (mediaTag?.[1]) {
        (session.intake_data as Record<string, unknown>)["_pending_media_doc"] = mediaTag[1];
      }
    } catch (err) {
      console.error("[brain] erro:", err);
      replies.push(
        "Tive um problema momentâneo. Pode repetir? Se preferir, escreva 'consultor' que chamo nossa equipe.",
      );
    }
  }

  // Dossiê de fechamento quando a conversa passa para humano/consultor
  const { data: after } = await supabaseAdmin
    .from("sessions").select("mode").eq("id", session.id).maybeSingle();
  const handoff =
    (after?.mode === "humano" || after?.mode === "aguardando") && after?.mode !== session.mode;

  const botOutbound = session.mode !== "humano";
  if (replies.length > 0) {
    await deliverTextReplies(
      session.id,
      msg.phone,
      waTarget,
      replies,
      session.intake_data ?? {},
      botOutbound,
      msg.inboundKind,
    );
  }

  if (replies.length > 0 && session.mode !== "humano") {
    const {
      pickSendableKnowledgeMedia,
      getSendableKnowledgeMediaById,
      signedKnowledgeMediaUrl,
    } = await import("@/lib/knowledge.server");
    const taggedId = session.intake_data?.["_pending_media_doc"] as string | undefined;
    let media = taggedId
      ? await getSendableKnowledgeMediaById(taggedId, msg.organizationId)
      : null;
    if (!media) {
      media = await pickSendableKnowledgeMedia(msg.text, msg.organizationId);
    }
    if (media?.file_path) {
      const url = await signedKnowledgeMediaUrl(media.file_path);
      if (url) {
        await new Promise((r) => setTimeout(r, 800));
        const imgRes = await sendWhatsAppImage(
          waTarget,
          msg.phone,
          url,
          media.caption ?? undefined,
        );
        if (imgRes.ok) {
          await persistMessage(
            session.id,
            "out",
            "bot",
            media.caption || `📎 ${media.title}`,
            { knowledge_doc_id: media.id, media_kind: "image" },
          );
        } else {
          console.error("[meta] imagem base conhecimento:", imgRes.reason);
        }
      }
    }
    if (taggedId) {
      const intake = { ...(session.intake_data ?? {}) };
      delete intake["_pending_media_doc"];
      await supabaseAdmin
        .from("sessions")
        .update({ intake_data: intake as never })
        .eq("id", session.id);
    }

    const { pickSendableKnowledgeLink } = await import("@/lib/knowledge.server");
    const link = await pickSendableKnowledgeLink(msg.text, msg.organizationId);
    if (link && !replies.some((r) => r.includes(link.url))) {
      const linkMsg = `Confira: ${link.title}\n${link.url}`;
      await persistMessage(session.id, "out", "bot", linkMsg, {
        knowledge_link: link.url,
      });
      await new Promise((r) => setTimeout(r, typingDelayMs(linkMsg)));
      const linkRes = await sendWhatsAppText(waTarget, msg.phone, linkMsg).catch(
        (e) => ({ ok: false, reason: String(e) }) as const,
      );
      if (!linkRes.ok) console.error("[meta] link falhou:", linkRes.reason);
    }
  }

  if (handoff) {
    const { generateDossie } = await import("@/lib/dossie.server");
    await generateDossie(session.id).catch((e) => console.error("[dossie] falhou:", e));
    await notifyOwner(msg, session.id).catch((e) => console.error("[alerta] falhou:", e));
  }

  return { replies, sessionId: session.id };
}