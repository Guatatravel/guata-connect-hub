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
import { quotePromptRules } from "@/lib/quote-format";
import { reservationPromptRules } from "@/lib/reservation-rules";
import { quoteValidityForOrg } from "@/lib/passhub.server";
import {
  sendWhatsAppText,
  sendWhatsAppImage,
  sendWhatsAppAudio,
  sendWhatsAppAudioBytes,
  sendWhatsAppDocument,
  sendWhatsAppDocumentBytes,
  sendWhatsAppImageBytes,
  markReadAndTyping,
  typingDelayMs,
} from "@/lib/meta-send.server";
import { applyInboundCrm, markQuoteSent, runDueFollowUps } from "@/lib/crm.server";
import {
  handleBotAudioPreferenceMessage,
  readBotAudioPrefs,
  shouldSendAudioReply,
  resolveTtsVoice,
  type BotVoiceProfile,
} from "@/lib/bot-audio-preference.server";
import {
  getOrgBotAudioPolicy,
  orgCanSendTtsNow,
  recordOrganizationTtsUsage,
  defaultIntakeForNewSession,
} from "@/lib/bot-audio-org.server";
import {
  isBotTtsConfigured,
  plainTextForSpeech,
  synthesizeBotSpeechDetailed,
} from "@/lib/tts.server";
import { signedChatMediaUrl, storeChatMedia } from "@/lib/chat-media.server";
import { formatForWhatsApp, splitWhatsAppMessages } from "@/lib/whatsapp-messages.server";
import {
  classifyTemplateUserReply,
  findRecentTemplateForSession,
  historyContentFromRow,
  templateAcceptPromptSection,
  templateDeclineReply,
  templateFollowUpPromptSection,
  type TemplateUserReplyKind,
} from "@/lib/whatsapp-template-context.server";
import {
  detectLeadStage,
  leadStagePromptSection,
  mergeLeadStage,
  type LeadStage,
} from "@/lib/lead-stage.server";
import { ensureTravelIntakeForSession } from "@/lib/lead-intake.server";
import {
  buildOwnerGroupOfferAlert,
  GROUP_OFFER_INTAKE_STATE,
  groupOfferBriefingPromptExtra,
  groupOfferFromIntake,
  handleGroupOfferTurn,
  isActiveGroupOfferFlow,
  quotePreviewWhenUnresolved,
  quotedMessageIsCampaignTemplate,
  resolveQuotedTextInSession,
  shouldStartGroupOfferFlow,
  templateReplyBlocksGroupOffer,
} from "@/lib/group-offer-intake.server";
import {
  getGuataOrganizationId,
  organizationUsesDescubra,
} from "@/lib/organizations.server";

import { AGENCY_COMMERCIAL_NAME } from "@/lib/agency-branding";

/** Nome comercial da agência em prompts e mensagens fixas do bot. */
export const AGENCY_NAME = AGENCY_COMMERCIAL_NAME;

export interface IncomingMessage {
  organizationId: string;
  line: "descubra" | "viagens";
  phone: string;
  contactName?: string;
  text: string;
  messageId?: string;
  inboundKind?: "text" | "image" | "audio" | "unsupported";
  unsupportedAutoReply?: boolean;
  mediaPath?: string;
  mediaMime?: string;
  mediaKind?: "image" | "audio" | "video" | "document";
  mediaFilename?: string;
  /** wamid da mensagem que o cliente citou, se houver. */
  quotedWaMessageId?: string;
  quotedForwarded?: boolean;
  referral?: {
    source_type?: string;
    headline?: string;
    body?: string;
  };
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
  return /\b(monte isso para você|monte (essa|a) viagem|Guat[aá] Viagens(?: e Turismo)? monte)\b/i.test(
    text,
  );
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
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      session_id: sessionId,
      direction,
      author,
      text,
      ...(metadata ? { metadata: metadata as never } : {}),
    })
    .select("id")
    .single();
  if (error) {
    console.error("[persist] mensagem:", error.message);
    return null;
  }
  await supabaseAdmin
    .from("sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
  return data.id as string;
}

async function attachWaMessageId(rowId: string | null, waMessageId?: string) {
  if (!rowId || !waMessageId) return;
  const { data } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("id", rowId)
    .maybeSingle();
  const metadata = {
    ...((data?.metadata as { delivery_status?: string } | null) ?? {}),
    wa_message_id: waMessageId,
    delivery_status:
      (data?.metadata as { delivery_status?: string } | null)?.delivery_status || "sent",
  };
  await supabaseAdmin
    .from("messages")
    .update({ metadata: metadata as never })
    .eq("id", rowId);
}

async function markOutboundDeliveryFailed(rowId: string | null, reason: string) {
  if (!rowId) return;
  const { data } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("id", rowId)
    .maybeSingle();
  const metadata = {
    ...((data?.metadata as Record<string, unknown> | null) ?? {}),
    delivery_status: "failed",
    delivery_error: reason.slice(0, 500),
  };
  await supabaseAdmin
    .from("messages")
    .update({ metadata: metadata as never })
    .eq("id", rowId);
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
  origem: "De qual cidade vocês estão saindo?",
  destino: "Qual destino te interessa? (cidade/região ou aberto a sugestão)",
  datas: "Quais as datas ou o mês previsto? (ida e volta, ou flexível)",
  pax: "Quantos adultos e quantas crianças? Se tiver criança, qual a idade de cada uma *na data da viagem*?",
  orcamento: "Qual orçamento aproximado por pessoa (ou total da família)?",
  preferencias:
    "Preferem aéreo ou rodoviário (ônibus)? E hospedagem mais econômica, intermediária ou resort/charme?",
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
  agent_gender: "male" | "female";
  tts_voice_profile: BotVoiceProfile;
}

async function loadAttendant(
  line: "descubra" | "viagens",
  organizationId: string,
): Promise<AttendantConfig | null> {
  const { data } = await supabaseAdmin
    .from("attendants")
    .select(
      "persona, criatividade, modelo, usa_base_local, usa_base_descubra, agent_gender, tts_voice_profile",
    )
    .eq("line", line)
    .eq("organization_id", organizationId)
    .eq("ativo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    persona: String(row.persona ?? ""),
    criatividade: Number(row.criatividade ?? 0.6),
    modelo: String(row.modelo ?? ""),
    usa_base_local: Boolean(row.usa_base_local),
    usa_base_descubra: Boolean(row.usa_base_descubra),
    agent_gender: row.agent_gender === "female" ? "female" : "male",
    tts_voice_profile: row.tts_voice_profile === "female" ? "female" : "male",
  };
}

function agentGenderPrompt(gender: "male" | "female"): string {
  if (gender === "female") {
    return "\n- A agente é feminina: fale de si como eu/a assistente/dela, nunca como o Guatá masculino.";
  }
  return "\n- O agente é masculino (Guatá): fale de si como eu/o Guatá/dele, nunca feminino.";
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

const GUATA_CORE_PERSONA = `Você é o Guatá (masculino: ele/o Guatá, nunca feminino): natural de Mato Grosso do Sul (MS é sua casa e sua raiz), espírito de aventureiro, caloroso e direto.
- Sua raiz é MS, mas você é consultor de viagens do Brasil e do mundo: fale de qualquer destino com a mesma autoridade e entusiasmo.
- Quando o assunto for MS (destinos, cultura, gastronomia, eventos, roteiros), mostre o orgulho de quem é daqui; quando for outro lugar, foque nesse lugar sem puxar de volta para MS.
- Você é primeiro um anfitrião e especialista, não um vendedor: encante com informação útil e NUNCA empurre a agência em toda mensagem.
- Venda consultiva: depois de ajudar, faça UMA pergunta direta de planejamento por vez, encaixada na conversa.
- Só apresente a ${AGENCY_NAME} quando o cliente quiser valores, reserva, pacote ou cotação (ex.: "Aqui na ${AGENCY_NAME} a gente cuida das reservas e vouchers pra você").
- NUNCA invente preço de passagem aérea ou diária de hotel. Valores fixos da base de conhecimento (passeios, day use) podem ser citados; fora isso, dê só faixas médias e diga que o consultor traz a tarifa real.
- NUNCA diga que não pode ajudar com viagem personalizada ou destino fora de MS.`;

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
    .select("author, text, metadata")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(12);
  const hist = (data ?? []).reverse().map((m) => ({
    role: (m.author === "user" ? "user" : "assistant") as "user" | "assistant",
    content: historyContentFromRow(
      m.text,
      (m.metadata ?? {}) as Record<string, unknown>,
    ),
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
  templatePromptExtra?: string,
): Promise<string> {
  const orgId = sessionId ? await sessionOrganizationId(sessionId) : await getGuataOrganizationId();
  const attendant = await loadAttendant(line, orgId);
  const descubraAllowed = await organizationUsesDescubra(orgId);
  const official =
    line === "descubra" && descubraAllowed ? await getGuataPersona() : null;
  const persona =
    buildSystemPersona(line, official, attendant) +
    agentGenderPrompt(attendant?.agent_gender ?? "male");

  let context = "";

  // Base de conhecimento própria (documentos, textos e links anexados no painel)
  const { listSendableKnowledgeForPrompt } = await import("@/lib/knowledge.server");
  const sendableCatalog = await listSendableKnowledgeForPrompt(orgId, line).catch(() => []);

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
  const quoteValidityMin = await quoteValidityForOrg(orgId).catch(() => 15);
  const handoffResumedAt = intakeData?.["handoff_resumed_at"];
  const postHandoffRules =
    typeof handoffResumedAt === "string" &&
    Number.isFinite(Date.parse(handoffResumedAt)) &&
    Date.now() - Date.parse(handoffResumedAt) < 7 * 24 * 60 * 60 * 1000
      ? "\n\n## RETOMADA APÓS CONSULTOR\n- O consultor humano já atendeu; você voltou para tirar dúvidas e avançar o que for simples.\n- NÃO reinicie triagem nem pergunte origem, destino, datas ou quantidade de pessoas se já constam no histórico.\n- Esclareça curiosidades e ajude na decisão; ofereça consultor humano só para valores finais, pagamento ou contrato.\n- Não diga que o consultor ainda vai falar — continue o atendimento com naturalidade.\n"
      : "";
  const whatsappRules =
    postHandoffRules +
    "\n\n## IDIOMA\n- Responda SEMPRE no mesmo idioma da última mensagem do cliente (português, inglês, espanhol etc.).\n" +
    `\n## ESSÊNCIA DO GUATÁ\n- Você nasceu em Mato Grosso do Sul: acolhedor, hospitaleiro, apaixonado por natureza. Esse é o seu jeito — não um limite.\n- Você é consultor de viagens para o Brasil e o mundo (Rondônia, Nordeste, Gramado, Disney, Europa, cruzeiros…). Fale de qualquer destino com autoridade e entusiasmo, dê dicas reais e roteiros.\n- Não puxe a conversa de volta para MS quando o cliente fala de outro lugar. Cite MS só quando fizer sentido ou o cliente perguntar.\n- Nunca diga que só atende MS ou que não conhece outro destino.\n` +
    `\n## CONVERSA E ASSUNTO\n- Responda PRIMEIRO o que o cliente perguntou (MS ou qualquer destino). Use o histórico: perguntas de follow-up continuam o mesmo tema.\n- PROIBIDO: apresentação longa, emoji 🦦, menu "o que você gostaria de saber sobre turismo em MS", ou repetir "sou o Guatá, guia inteligente" quando já há pergunta concreta ou conversa em andamento.\n- Use os documentos e a base do contexto só se forem sobre o destino em pauta; ignore trechos de outros lugares.\n- Se for só curiosidade/informação, RESPONDA e pare — não transforme em cotação.\n- Só conduza para cotação com a ${AGENCY_NAME} quando o cliente pedir preço, pacote, montar viagem ou orçamento.\n- Parceiros Descubra MS no contexto podem ser recomendados quando o assunto for MS.\n` +
    (leadStage === "informacional"
      ? `\n## MODO SÓ INFORMAÇÃO (obrigatório neste estágio)\n- O cliente NÃO pediu cotação. Responda a dúvida com conteúdo útil.\n- PROIBIDO perguntar: origem, datas, quantas pessoas, orçamento, aéreo/ônibus, hospedagem, perfil da viagem.\n- PROIBIDO oferecer consultor ou "montar pacote" neste turno.\n- Se no final couber um convite leve, no máximo uma frase opcional do tipo "se quiser orçamento depois é só falar" — sem interrogatório.\n`
      : `\n## BRIEFING DE COTAÇÃO (conversa de consultor — tudo mastigado para a equipe)\nO cliente quer cotação/pacote. Seu papel é CONVERSAR como um bom consultor no WhatsApp: entender a viagem e deixar o briefing COMPLETO para o consultor humano da ${AGENCY_NAME} montar tarifa/roteiro sem perguntar de novo.\n\nEstilo (obrigatório):\n- Tom humano, curto, acolhedor (ex.: "Ótimo!", "Entendido!", "Perfeito!").\n- UMA pergunta concreta por mensagem — nunca lista numerada nem "me passa: 1) 2) 3)".\n- Use o que a pessoa já disse; confirme e avance (não repita pergunta respondida).\n- Quando a resposta for vaga, SUGIRA opções concretas e peça confirmação (ex.: mês "julho/férias" → "Que tal 16 a 21 de julho?"; destino aberto → sugira 1 destino que faça sentido para o perfil e pergunte o que acha).\n- Se falar da família (pais, filhos, idades), aprofunde o que falta (quartos, quem dorme com quem, mobilidade de idosos) com naturalidade.\n- Não invente dados; se não disser, pergunte.\n\nColete (pule o que já está no histórico):\n1. Origem (cidade de saída) e destino (se amplo, sugira ou peça cidade/praia).\n2. Datas ou mês; quantos dias; ida e volta; aceite "flexível".\n3. Quem viaja: total; adultos/crianças; idade de cada criança *na data da viagem*; idosos se citados.\n4. Quartos / arranjo (casal, quem divide com filhos/pais) quando for família/grupo.\n5. Transporte: aéreo ou rodoviário se fizer sentido.\n6. Hospedagem: econômica / intermediária / charme; café ou all inclusive se relevante.\n7. Orçamento aproximado só se toparem; senão siga sem insistir.\n8. Restrições (mobilidade, comida, o que não quer).\n\nQuando passar ao humano:\n- Só ofereça consultor quando o briefing estiver completo ou quase (origem, destino, datas/período, composição do grupo no mínimo) e a pessoa quiser a proposta/valores — ou se pedir pagar/fechar.\n- Frase natural (ex.: "Perfeito! Já deixo tudo organizado e nosso consultor da ${AGENCY_NAME} monta o pacote pra você olhar.") e termine com [[OFERTA_HUMANO]].\n- NÃO transfira cedo demais: o consultor deve receber a conversa mastigada.\n- NUNCA transfira sozinho só por dúvida turística — isso você resolve.\n`) +
    quotePromptRules(quoteValidityMin) +
    reservationPromptRules(AGENCY_NAME) +
    "\n## CANAL WHATSAPP\n- Seja OBJETIVO: 1–3 frases curtas + no máximo UMA pergunta. Pessoas não leem textão no WhatsApp.\n- Cotação/pacote/pagamento: vá direto ao ponto (sem repetir o cartaz inteiro).\n- Só alongue um pouco em curiosidade/roteiro se o cliente pediu detalhe; ainda assim evite muralhas de texto.\n- Se o cliente mandou *nota de voz*, o sistema envia sua resposta em áudio automaticamente; escreva o texto normalmente e NUNCA diga que não pode responder em áudio ou que há limitação da ferramenta.\n- Se a base citar \"Link para o cliente:\" ou um URL (vídeo, site, roteiro), inclua o link completo https://... na resposta para o cliente abrir no celular.\n- Não repita o mesmo link https que você já enviou antes nesta conversa.\n- NUNCA diga que não pode enviar PDF, mapa, imagem ou arquivo no WhatsApp — o sistema pode anexar após sua resposta.\n- Não diga que o arquivo \"já está anexado\" ou \"segue em anexo\" — o sistema envia o arquivo sozinho depois do seu texto; só explique o que é o material.\n- Não repita na mensagem o título interno do PDF (nome de arquivo .pdf) — o cliente recebe o documento em seguida.\n- PROIBIDO usar 📎 ou citar o nome dos itens da seção ARQUIVOS NO WHATSAPP; o sistema envia o arquivo sozinho.\n- Ao recomendar vídeo ou lugar da base, fale como quem já visitou (ex.: \"Olha, eu já conheci…\") e inclua o link https completo na mensagem se for enviar; evite mensagens só com URL sem contexto.\n- Se o cliente pedir mapa/PDF/arquivo, responda com conteúdo útil; não invente bloqueio técnico.\n- Não cite link de agência comercial em pergunta só informativa (mapa, atração, roteiro).\n- Sem menus numerados. Tom natural. NÃO use markdown (sem ** ou ##). Destaque com no máximo *uma* palavra em asterisco por trecho.\n- O Guatá é masculino: fale de si como eu/o Guatá/dele, nunca ela/a Guatá como pessoa.\n" +
    (ongoing
      ? "- A conversa JÁ está em andamento: NÃO cumprimente de novo (sem 'Olá', 'Oi', 'Que pergunta ótima'). Vá direto ao ponto.\n"
      : "- Se for só um cumprimento, cumprimente uma vez (sem textão) e pergunte como pode ajudar.\n") +
    (firstName
      ? `- O cliente se chama ${firstName}. Use o primeiro nome de forma natural, no máximo uma vez, sem repetir em toda mensagem.\n`
      : "") +
    leadStagePromptSection(leadStage, AGENCY_NAME, { mayOfferTravelHook }) +
    (sendableCatalog.length > 0
      ? "\n\n## ARQUIVOS NO WHATSAPP (envio contextual)\n" +
        "Materiais da base que você PODE enviar. Regras:\n" +
        "- Só envie se o material for sobre o MESMO destino/cidade/assunto que está sendo conversado agora (leia o histórico). Ex.: conversa sobre São Luís ou Jericoacoara → NUNCA envie mapa de Campo Grande, Bonito ou outro lugar.\n" +
        "- Se o título/hint do arquivo citar outra cidade que NÃO é o destino da conversa, NÃO use a marca — zero PDF/mídia.\n" +
        "- Envie quando o cliente pedir (mapa, PDF, folheto, foto) ou quando o material claramente ajudar naquela resposta. Na dúvida, NÃO envie.\n" +
        "- No máximo um material por resposta; não reenvie o que já mandou nesta conversa.\n" +
        "- Para enviar, termine a resposta com a marca indicada. Sem a marca, nada é enviado.\n" +
        sendableCatalog
          .map((s) => {
            if (s.kind === "pdf") {
              return `- PDF ${s.id}: ${s.title} — ${s.hint} → [[ENVIAR_PDF:${s.id}]] (não mencione título nem 📎)`;
            }
            return `- Imagem ${s.id}: ${s.title} — ${s.hint} → [[ENVIAR_MIDIA:${s.id}]]`;
          })
          .join("\n")
      : "");

  const { chatForOrganization } = await import("@/lib/ai-quota.server");
  const raw = await chatForOrganization(
    orgId,
    [{ role: "system", content: persona + context + whatsappRules + (templatePromptExtra ?? "") }, ...history],
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
  attendantTtsVoice: BotVoiceProfile | null,
  inboundWaMessageId?: string,
): Promise<void> {
  const audioPrefs = readBotAudioPrefs(intake);
  const ttsVoice = resolveTtsVoice(intake, attendantTtsVoice);
  const orgPolicy = await getOrgBotAudioPolicy(waTarget.organizationId);
  const quotaOk = orgCanSendTtsNow(orgPolicy);
  const tryAudio =
    botMode &&
    orgPolicy.allowBotAudio &&
    quotaOk &&
    shouldSendAudioReply(intake, inboundKind) &&
    isBotTtsConfigured() &&
    replies.length > 0;

  if (inboundKind === "audio" && !tryAudio) {
    console.warn("[bot-audio] resposta em texto (áudio não tentado):", {
      botMode,
      allowBotAudio: orgPolicy.allowBotAudio,
      quotaOk,
      textOnly: audioPrefs.textOnly,
      ttsConfigured: isBotTtsConfigured(),
    });
  }

  let audioFailReason: string | null = null;

  for (let i = 0; i < replies.length; i++) {
    const text = replies[i];

    if (i === 0 && tryAudio) {
      // Marca o áudio do cliente como lido/reproduzido (microfone azul) antes do TTS.
      if (inboundWaMessageId) {
        await markReadAndTyping(waTarget, inboundWaMessageId, { typing: false });
        await markReadAndTyping(waTarget, inboundWaMessageId, { typing: true });
      }
      const speech = await synthesizeBotSpeechDetailed(text, ttsVoice);
      if (speech.ok) {
        try {
          let audioPath: string | undefined;
          try {
            audioPath = await storeChatMedia(phone, speech.bytes, speech.mimeType, "audio");
          } catch (e) {
            console.error("[chat-media] áudio outbound:", e);
          }
          const voiceNote = speech.mimeType.includes("ogg");
          if (inboundWaMessageId) await markReadAndTyping(waTarget, inboundWaMessageId);
          let audioRes = await sendWhatsAppAudioBytes(
            waTarget,
            phone,
            speech.bytes,
            speech.mimeType,
            { voice: voiceNote },
          ).catch((e) => ({ ok: false, reason: String(e) }) as const);
          if (!audioRes.ok && audioPath) {
            const url = await signedChatMediaUrl(audioPath, 60 * 60);
            if (url) {
              audioRes = await sendWhatsAppAudio(waTarget, phone, url, { voice: voiceNote }).catch(
                (e) => ({ ok: false, reason: String(e) }) as const,
              );
            }
          }
          if (audioRes.ok) {
            console.log("[meta] áudio enviado:", "messageId" in audioRes ? audioRes.messageId : "");
            await persistMessage(sessionId, "out", "bot", text, {
              outbound_kind: "audio",
              media_kind: "audio",
              media_mime: speech.mimeType,
              ...(audioPath ? { media_path: audioPath } : {}),
              ...("messageId" in audioRes && audioRes.messageId
                ? { wa_message_id: audioRes.messageId, delivery_status: "sent" }
                : {}),
            });
            await recordOrganizationTtsUsage(
              waTarget.organizationId,
              plainTextForSpeech(text).length,
            );
            continue;
          }
          audioFailReason = audioRes.reason ?? "meta_audio_failed";
          console.error("[meta] áudio falhou:", audioFailReason);
        } catch (e) {
          audioFailReason = e instanceof Error ? e.message : String(e);
          console.error("[tts] envio:", e);
        }
      } else {
        audioFailReason = speech.reason;
        console.error("[tts] síntese falhou:", audioFailReason);
      }
    }

    if (audioFailReason && i === 0) {
      console.warn("[bot-audio] TTS/envio falhou; resposta só em texto:", audioFailReason);
    }

    const outMeta =
      i === 0 && audioFailReason
        ? { tts_attempted: true, tts_error: audioFailReason.slice(0, 500) }
        : undefined;
    const rowId = await persistMessage(sessionId, "out", "bot", text, outMeta);

    if (inboundWaMessageId && i === 0) await markReadAndTyping(waTarget, inboundWaMessageId);
    const delayMs = i === 0 ? typingDelayMs(text) : Math.min(400, 150 + text.length * 2);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    const res = await sendWhatsAppText(waTarget, phone, text).catch(
      (e) => ({ ok: false, reason: String(e) }) as const,
    );
    if (!res.ok) {
      console.error("[meta] send falhou:", res.reason);
      await markOutboundDeliveryFailed(rowId, res.reason ?? "meta_send_failed");
    } else {
      console.log("[meta] enviado:", "messageId" in res ? res.messageId : "");
      await attachWaMessageId(rowId, "messageId" in res ? res.messageId : undefined);
    }
  }
}

function ownerAlertPhone(): string {
  return (process.env["OWNER_ALERT_PHONE"] || "5567992123617").replace(/\D/g, "");
}

/** Mesmo número com/sem o 9 extra brasileiro. */
function samePhone(a: string, b: string): boolean {
  const norm = (p: string) => {
    const d = p.replace(/\D/g, "");
    return d.length === 13 && d.startsWith("55") ? d.slice(0, 4) + d.slice(5) : d;
  };
  return norm(a) === norm(b);
}

async function handleOwnerCommand(msg: IncomingMessage): Promise<boolean> {
  if (!samePhone(msg.phone, ownerAlertPhone())) return false;
  const t = msg.text.trim().toLowerCase();
  const isContinue = /^(1|continuar|continua|continue|guatá|guata)$/.test(t);
  const isTake = /^(2|assumi|assumo|eu atendo)$/.test(t);
  if (!isContinue && !isTake) return false;
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, contact_name, intake_data")
    .eq("organization_id", msg.organizationId)
    .eq("mode", "humano")
    .limit(50);
  const pending = (data ?? [])
    .map((s) => ({ ...s, at: (s.intake_data as Record<string, unknown> | null)?.["owner_alert_at"] }))
    .filter((s): s is typeof s & { at: string } => typeof s.at === "string")
    .sort((a, b) => b.at.localeCompare(a.at));
  const target = pending[0];
  const reply = async (text: string) => {
    await sendWhatsAppText({ organizationId: msg.organizationId, line: msg.line }, msg.phone, text);
  };
  if (!target) {
    await reply("Não há nenhum cliente aguardando consultor agora.");
    return true;
  }
  const name = target.contact_name ?? "o cliente";
  if (isContinue) {
    const { resumeBotForSession } = await import("@/lib/handoff-resume.server");
    await resumeBotForSession(target.id, "owner");
    await reply(`Certo! O Guatá voltou a atender ${name}.`);
  } else {
    const intake = { ...((target.intake_data ?? {}) as Record<string, unknown>) };
    delete intake["owner_alert_at"];
    intake["owner_took_at"] = new Date().toISOString();
    await supabaseAdmin.from("sessions").update({ intake_data: intake as never }).eq("id", target.id);
    await reply(`Combinado! ${name} fica com você — o Guatá segue pausado nessa conversa.`);
  }
  return true;
}

async function notifyOwner(msg: IncomingMessage, sessionId: string) {
  const owner = ownerAlertPhone();
  const { data } = await supabaseAdmin
    .from("sessions").select("dossie, intake_data").eq("id", sessionId).maybeSingle();
  const d = (data?.dossie ?? {}) as Record<string, unknown>;
  const resumo = String(d["resumo"] ?? d["resumo_executivo"] ?? d["intencao"] ?? msg.text)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const phone = msg.phone.replace(/\D/g, "");
  const titleBit = resumo.split(/[.|]/)[0]?.trim().slice(0, 40) || "consultor";
  const text =
    `🔔 *Cliente aguardando — ${titleBit}*\n` +
    `Nome: ${msg.contactName ?? "Sem nome"}\n` +
    `WhatsApp: +${phone}\n` +
    (resumo ? `Resumo: ${resumo}\n` : "") +
    `Status: quer consultor\n\n` +
    `Painel: https://guata-connect-hub.lovable.app/conversas/${sessionId}\n` +
    `WhatsApp direto: https://wa.me/${phone}\n\n` +
    `Responda: 1 CONTINUAR (Guatá) | 2 ASSUMI (você atende)\n` +
    `Sem resposta em 10 min, o Guatá retoma sozinho.`;
  const intake = { ...((data?.intake_data ?? {}) as Record<string, unknown>) };
  intake["owner_alert_at"] = new Date().toISOString();
  await supabaseAdmin.from("sessions").update({ intake_data: intake as never }).eq("id", sessionId);
  const orgId = await sessionOrganizationId(sessionId);
  const res = await sendWhatsAppText(
    { organizationId: orgId, line: msg.line },
    owner,
    text,
  );
  if (!res.ok) console.error("[alerta] envio falhou:", res.reason);
}

async function notifyOwnerGroupOffer(
  msg: IncomingMessage,
  sessionId: string,
  offer: import("@/lib/group-offer-intake.server").GroupOfferData,
) {
  const owner = ownerAlertPhone();
  const text = buildOwnerGroupOfferAlert({
    contactName: msg.contactName,
    phone: msg.phone,
    sessionId,
    offer,
    lastUserText: msg.text,
  });
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("intake_data")
    .eq("id", sessionId)
    .maybeSingle();
  const intake = { ...((data?.intake_data ?? {}) as Record<string, unknown>) };
  intake["owner_alert_at"] = new Date().toISOString();
  await supabaseAdmin.from("sessions").update({ intake_data: intake as never }).eq("id", sessionId);
  const orgId = await sessionOrganizationId(sessionId);
  const res = await sendWhatsAppText(
    { organizationId: orgId, line: msg.line },
    owner,
    text,
  );
  if (!res.ok) console.error("[alerta-oferta] envio falhou:", res.reason);
}

export async function processMessage(
  msg: IncomingMessage,
): Promise<{ replies: string[]; sessionId: string }> {
  const { isOrganizationAccessLiberado } = await import("@/lib/organizations.server");
  if (!(await isOrganizationAccessLiberado(msg.organizationId))) {
    return { replies: [], sessionId: "" };
  }
  void import("@/lib/handoff-resume.server").then((m) =>
    m.resumeStaleHandoffs(msg.organizationId).catch((e) => console.error("[handoff] timeout:", e)),
  );
  if (await handleOwnerCommand(msg).catch((e) => (console.error("[owner-cmd]", e), false))) {
    return { replies: [], sessionId: "" };
  }
  const waTarget = { organizationId: msg.organizationId, line: msg.line };
  const session = await loadOrCreateSession(
    msg.organizationId,
    msg.line,
    msg.phone,
    msg.contactName,
  );
  let ownerAlertSent = false;

  const { isOrgBotPaused } = await import("@/lib/bot-pause.server");
  if (await isOrgBotPaused(msg.organizationId).catch(() => false)) {
    if (session.mode === "bot" || session.mode === "triagem" || session.mode === "aguardando") {
      await supabaseAdmin
        .from("sessions")
        .update({ mode: "humano", intake_state: null })
        .eq("id", session.id);
      session.mode = "humano";
    }
  }
  // Depois da pausa global — conversão forçada não dispara alerta de handoff.
  const modeAtStart = session.mode;

  if (msg.messageId && session.mode !== "humano") {
    void markReadAndTyping(waTarget, msg.messageId, { typing: true });
  }
  if (msg.contactName?.trim()) {
    await supabaseAdmin
      .from("sessions")
      .update({ contact_name: msg.contactName.trim() })
      .eq("id", session.id);
  }
  await applyInboundCrm(session.id, msg.text).catch((e) => console.error("[crm]", e));
  void runDueFollowUps(msg.organizationId).catch((e) => console.error("[follow-up]", e));
  let quotePreview: string | undefined;
  if (msg.quotedWaMessageId) {
    const quotedText = await resolveQuotedTextInSession(session.id, msg.quotedWaMessageId);
    if (!quotedText) quotePreview = quotePreviewWhenUnresolved(msg.quotedForwarded);
  }
  await persistMessage(session.id, "in", "user", msg.text, {
    inbound_kind: msg.inboundKind ?? "text",
    ...(msg.messageId ? { wa_message_id: msg.messageId } : {}),
    ...(msg.quotedWaMessageId ? { quoted_wa_message_id: msg.quotedWaMessageId } : {}),
    ...(quotePreview
      ? { reply_preview: quotePreview, quote_unresolved: true, quote_from_group_hint: true }
      : {}),
    ...(msg.referral
      ? {
          inbound_referral_type: msg.referral.source_type,
          inbound_referral_headline: msg.referral.headline,
        }
      : {}),
    ...(msg.mediaPath
      ? {
          media_path: msg.mediaPath,
          media_mime: msg.mediaMime,
          media_kind: msg.mediaKind,
          ...(msg.mediaFilename ? { filename: msg.mediaFilename } : {}),
        }
      : {}),
  });
  const firstName = msg.contactName?.trim().split(/\s+/)[0];
  const handoffText = firstName
    ? `Perfeito, ${firstName}! Já avisei nosso consultor, ele vai falar com você por aqui em instantes. 😊`
    : "Perfeito! Já avisei nosso consultor, ele vai falar com você por aqui em instantes. 😊";

  const lower = msg.text.trim().toLowerCase();
  const replies: string[] = [];
  let templatePromptExtra: string | undefined;
  const offered = session.intake_state === "oferta_humano";
  const recentTemplate =
    session.mode !== "humano" ? await findRecentTemplateForSession(session.id) : null;

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

  if (msg.unsupportedAutoReply) {
    const { UNSUPPORTED_CLIENT_REPLY } = await import("@/lib/whatsapp-inbound.server");
    const { data: modeRow } = await supabaseAdmin
      .from("sessions")
      .select("mode")
      .eq("id", session.id)
      .maybeSingle();
    const mode = modeRow?.mode ?? session.mode;
    const unsupportedReplies: string[] = mode !== "humano" ? [UNSUPPORTED_CLIENT_REPLY] : [];
    if (unsupportedReplies.length > 0) {
      const activeAttendant = await loadAttendant(msg.line, msg.organizationId);
      await deliverTextReplies(
        session.id,
        msg.phone,
        waTarget,
        unsupportedReplies,
        session.intake_data ?? {},
        true,
        msg.inboundKind,
        activeAttendant?.tts_voice_profile ?? null,
        msg.messageId,
      );
    }
    return { replies: unsupportedReplies, sessionId: session.id };
  }

  const audioPrefCmd = await handleBotAudioPreferenceMessage(
    session.id,
    session.intake_data ?? {},
    msg.text,
    msg.organizationId,
    msg.inboundKind,
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
    const intake_data: Record<string, unknown> = {
      ...(session.intake_data ?? {}),
      lead_stage: "quente" as LeadStage,
      lead_updated_at: new Date().toISOString(),
    };
    const pendingOffer = groupOfferFromIntake(intake_data);
    let alertOffer: import("@/lib/group-offer-intake.server").GroupOfferData | null = null;
    if (pendingOffer && !pendingOffer.alerted_at) {
      pendingOffer.alerted_at = new Date().toISOString();
      pendingOffer.step = "done";
      pendingOffer.confirmed_at = pendingOffer.confirmed_at ?? new Date().toISOString();
      intake_data["group_offer"] = pendingOffer;
      alertOffer = pendingOffer;
    }
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano", intake_state: null, intake_data: intake_data as never })
      .eq("id", session.id);
    session.intake_data = intake_data;
    // Não atualiza session.mode aqui — o check de handoff no fim usa modeAtStart.
    void ensureTravelIntakeForSession(session.id).catch((e) =>
      console.error("[lead-intake] handoff:", e),
    );
    if (alertOffer) {
      await notifyOwnerGroupOffer(msg, session.id, alertOffer).catch((e) =>
        console.error("[alerta-oferta] handoff:", e),
      );
      ownerAlertSent = true;
    } else {
      await notifyOwner(msg, session.id).catch((e) => console.error("[alerta] handoff:", e));
      ownerAlertSent = true;
    }
    replies.push(handoffText);
  };

  const wantsStructuredIntake =
    /\b(montar (minha )?viagem|orçamento de viagem|orcamento de viagem|fazer orçamento|fazer orcamento|quero orçamento completo|quero orcamento completo)\b/i.test(
      lower,
    );

  const templateReplyKind =
    recentTemplate && session.mode !== "humano" && !offered
      ? classifyTemplateUserReply(msg.text, recentTemplate)
      : null;

  if (templateReplyKind === "accept" && recentTemplate) {
    templatePromptExtra = templateAcceptPromptSection(recentTemplate);
  } else if (templateReplyKind === "follow_up" && recentTemplate) {
    templatePromptExtra = templateFollowUpPromptSection(recentTemplate, msg.text);
  }

  let unresolvedGroupQuote = false;
  if (msg.quotedWaMessageId) {
    const quotedLocal = await resolveQuotedTextInSession(session.id, msg.quotedWaMessageId);
    unresolvedGroupQuote = !quotedLocal;
  }
  if (
    unresolvedGroupQuote ||
    msg.quotedForwarded ||
    /\b(dessa\s+promo|dessa\s+oferta|desse\s+pacote|quero\s+(essa|desse|dessa)\s+)/i.test(msg.text)
  ) {
    const groupCiteRules =
      `\n\n## MARCAÇÃO / PROMOÇÃO DO GRUPO\n` +
      `- O cliente veio citando uma foto/promoção do grupo (ou disse "dessa promoção").\n` +
      `- A Meta NÃO enviou o destino dessa foto. PROIBIDO inventar destino (ex.: Porto Seguro, Bonito) se ele não escreveu.\n` +
      `- Responda a dúvida pontual (pagamento etc.) com cuidado: não invente condição de boleto; diga que o consultor confirma no pacote certo.\n` +
      `- Em seguida peça o destino/nome da promoção ou que mande a foto de novo — UMA pergunta.\n` +
      `- Só ofereça consultor com [[OFERTA_HUMANO]] depois de saber qual promoção/destino, ou se ele já disser claramente.\n`;
    templatePromptExtra = (templatePromptExtra ?? "") + groupCiteRules;
  }

  const groupIngress = {
    quotedWaMessageId: msg.quotedWaMessageId,
    inboundKind: msg.inboundKind,
    text: msg.text,
    referral: msg.referral,
    quotedForwarded: msg.quotedForwarded,
  };
  const templateBlocksGroup = templateReplyBlocksGroupOffer(
    Boolean(recentTemplate),
    templateReplyKind as TemplateUserReplyKind | null,
    msg.text,
  );
  const quotedIsCampaign =
    msg.quotedWaMessageId && recentTemplate
      ? await quotedMessageIsCampaignTemplate(session.id, msg.quotedWaMessageId)
      : false;
  if (templateBlocksGroup || quotedIsCampaign) {
    const intakeClear = { ...(session.intake_data ?? {}) };
    delete intakeClear["group_offer"];
    if (isActiveGroupOfferFlow(session.intake_state, session.intake_data)) {
      await supabaseAdmin
        .from("sessions")
        .update({
          intake_state: null,
          intake_data: intakeClear as never,
        })
        .eq("id", session.id);
      session.intake_state = null;
      session.intake_data = intakeClear;
    }
  }
  const groupOfferActive =
    session.mode === "bot" &&
    !explicitHuman &&
    lower !== "menu" &&
    !wantsStructuredIntake &&
    !templateBlocksGroup &&
    !quotedIsCampaign &&
    (isActiveGroupOfferFlow(session.intake_state, session.intake_data) ||
      shouldStartGroupOfferFlow(groupIngress));
  if (audioPrefCmd.handled && audioPrefCmd.reply) {
    replies.push(audioPrefCmd.reply);
  } else if (groupOfferActive) {
    const turn = await handleGroupOfferTurn({
      sessionId: session.id,
      firstName,
      ingress: groupIngress,
      intake: session.intake_data ?? {},
      intakeState: session.intake_state,
    });
    session.intake_data = turn.patchIntake;
    session.intake_state = turn.intakeState;
    await supabaseAdmin
      .from("sessions")
      .update({
        intake_state: turn.intakeState,
        intake_data: turn.patchIntake as never,
        ...(turn.handoffHuman ? { mode: "humano" as const } : {}),
      })
      .eq("id", session.id);
    replies.push(...turn.replies);
    if (turn.notifyOwner) {
      const offer = turn.patchIntake["group_offer"] as import("@/lib/group-offer-intake.server").GroupOfferData;
      await notifyOwnerGroupOffer(msg, session.id, offer).catch((e) =>
        console.error("[alerta-oferta]", e),
      );
      ownerAlertSent = true;
    }
    if (turn.handoffHuman) {
      void ensureTravelIntakeForSession(session.id).catch((e) =>
        console.error("[lead-intake] oferta-grupo:", e),
      );
    } else if (turn.startBriefing) {
      const offer = turn.patchIntake["group_offer"] as import("@/lib/group-offer-intake.server").GroupOfferData;
      const briefingExtra =
        (templatePromptExtra ?? "") + groupOfferBriefingPromptExtra(offer);
      try {
        const raw = await answerTurismo(
          msg.text,
          msg.line,
          session.id,
          firstName,
          "qualificando",
          turn.patchIntake,
          briefingExtra,
        );
        const offerTag = raw.includes("[[OFERTA_HUMANO]]");
        const intakePatch: Record<string, unknown> = { ...turn.patchIntake };
        if (offerTag) {
          await supabaseAdmin
            .from("sessions")
            .update({
              intake_state: "oferta_humano",
              intake_data: intakePatch as never,
            })
            .eq("id", session.id);
          session.intake_state = "oferta_humano";
        }
        const mediaTag = raw.match(/\[\[ENVIAR_MIDIA:([0-9a-f-]{36})\]\]/i);
        const pdfTag = raw.match(/\[\[ENVIAR_PDF:([0-9a-f-]{36})\]\]/i);
        const body = raw
          .replace(/\[\[OFERTA_HUMANO\]\]/g, "")
          .replace(/\[\[ENVIAR_MIDIA:[0-9a-f-]{36}\]\]/gi, "")
          .replace(/\[\[ENVIAR_PDF:[0-9a-f-]{36}\]\]/gi, "")
          .trim();
        if (body) replies.push(...splitWhatsAppMessages(body));
        const taggedDocId = pdfTag?.[1] ?? mediaTag?.[1];
        if (taggedDocId) {
          (session.intake_data as Record<string, unknown>)["_pending_media_doc"] = taggedDocId;
        }
      } catch (err) {
        console.error("[brain] briefing-oferta:", err);
        replies.push(
          firstName
            ? `Fechado, ${firstName}! De qual cidade vocês saem?`
            : "Fechado! De qual cidade vocês saem?",
        );
      }
    }
  } else if (session.mode !== "humano" && templateReplyKind === "decline" && recentTemplate) {
    replies.push(templateDeclineReply(recentTemplate, firstName));
    const { applyDoNotContact } = await import("@/lib/contact-opt-out.shared");
    const declinedIntake = applyDoNotContact(
      {
        ...(session.intake_data ?? {}),
        template_declined_at: new Date().toISOString(),
        template_declined_name: recentTemplate?.templateName,
      },
      "declined_invite",
    );
    await supabaseAdmin
      .from("sessions")
      .update({ intake_data: declinedIntake as never })
      .eq("id", session.id);
    const { clearFollowUp } = await import("@/lib/crm.server");
    await clearFollowUp(session.id).catch(() => undefined);
  } else if (
    session.mode !== "humano" &&
    (await import("@/lib/contact-opt-out.shared")).isStopContactRequest(msg.text)
  ) {
    const { applyDoNotContact } = await import("@/lib/contact-opt-out.shared");
    const stopIntake = applyDoNotContact({ ...(session.intake_data ?? {}) }, "client_request");
    await supabaseAdmin
      .from("sessions")
      .update({ intake_data: stopIntake as never, mode: "humano" })
      .eq("id", session.id);
    const { clearFollowUp } = await import("@/lib/crm.server");
    await clearFollowUp(session.id).catch(() => undefined);
    replies.push(
      firstName
        ? `${firstName}, combinado — não vou te mandar mais mensagens de divulgação. Se precisar de algo no futuro, é só escrever.`
        : "Combinado — não vou te mandar mais mensagens de divulgação. Se precisar de algo no futuro, é só escrever.",
    );
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
    const intakeMenu = { ...(session.intake_data ?? {}) };
    delete intakeMenu["group_offer"];
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "bot", intake_state: null, intake_data: intakeMenu as never })
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
      const confirmedOffer = groupOfferFromIntake(session.intake_data);
      const offerBriefingExtra =
        confirmedOffer?.confirmed_at && !confirmedOffer.alerted_at
          ? groupOfferBriefingPromptExtra(confirmedOffer)
          : "";
      const raw = await answerTurismo(
        msg.text,
        msg.line,
        session.id,
        firstName,
        confirmedOffer?.confirmed_at && !confirmedOffer.alerted_at
          ? leadStage === "informacional"
            ? "qualificando"
            : leadStage
          : leadStage,
        session.intake_data,
        (templatePromptExtra ?? "") + offerBriefingExtra,
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
      const pdfTag = raw.match(/\[\[ENVIAR_PDF:([0-9a-f-]{36})\]\]/i);
      const body = raw
        .replace(/\[\[OFERTA_HUMANO\]\]/g, "")
        .replace(/\[\[ENVIAR_MIDIA:[0-9a-f-]{36}\]\]/gi, "")
        .replace(/\[\[ENVIAR_PDF:[0-9a-f-]{36}\]\]/gi, "")
        .trim();
      replies.push(...splitWhatsAppMessages(body));
      const taggedDocId = pdfTag?.[1] ?? mediaTag?.[1];
      if (taggedDocId) {
        (session.intake_data as Record<string, unknown>)["_pending_media_doc"] = taggedDocId;
      }
    } catch (err) {
      // Não envia desculpa genérica ao cliente — retry/fallback já tentaram; só log.
      console.error("[brain] erro:", err);
    }
  }

  // Dossiê de fechamento quando a conversa passa para humano/consultor
  const { data: after } = await supabaseAdmin
    .from("sessions").select("mode").eq("id", session.id).maybeSingle();
  const handoff =
    (after?.mode === "humano" || after?.mode === "aguardando") &&
    after?.mode !== modeAtStart;
  if (after?.mode) session.mode = after.mode as typeof session.mode;

  const botOutbound = session.mode !== "humano";
  const activeAttendant = botOutbound
    ? await loadAttendant(msg.line, msg.organizationId)
    : null;
  if (replies.length > 0) {
    await deliverTextReplies(
      session.id,
      msg.phone,
      waTarget,
      replies,
      session.intake_data ?? {},
      botOutbound,
      msg.inboundKind,
      activeAttendant?.tts_voice_profile ?? null,
      msg.messageId,
    );
  }

  if (replies.length > 0 && session.mode !== "humano") {
    const { collectUrlsSentInSession, normalizeOutboundUrl, extractHttpUrls } =
      await import("@/lib/session-sent-urls.server");
    const sentUrls = await collectUrlsSentInSession(session.id);
    for (const r of replies) {
      for (const u of extractHttpUrls(r)) sentUrls.add(u);
    }

    const {
      pickSendableKnowledgeMedia,
      getSendableKnowledgeMediaById,
      downloadKnowledgeMediaBytes,
      signedKnowledgeMediaUrl,
    } = await import("@/lib/knowledge.server");
    const taggedId = session.intake_data?.["_pending_media_doc"] as string | undefined;
    // Envio contextual: quem decide é o Guatá (via [[ENVIAR_PDF/MIDIA]]), lendo a conversa toda.
    // O seletor por palavras só entra como reserva quando o cliente PEDE um arquivo
    // e o item tem palavras-chave cadastradas que batem com a mensagem dele.
    let media = taggedId
      ? await getSendableKnowledgeMediaById(taggedId, msg.organizationId)
      : null;
    if (!media) {
      // Assunto imediato: resposta que o Guatá acabou de dar + últimas falas do cliente.
      // Janela curta de propósito — falando de Rondônia, um mapa de Campo Grande não pode sair.
      const { data: recent } = await supabaseAdmin
        .from("messages")
        .select("text")
        .eq("session_id", session.id)
        .eq("author", "user")
        .order("created_at", { ascending: false })
        .limit(3);
      const contextText = [
        ...replies,
        ...(recent ?? []).map((m) => String(m.text ?? "")),
      ].join("\n");
      media = await pickSendableKnowledgeMedia(msg.text, msg.organizationId, 3, {
        strict: true,
        contextText,
      });
    }
    let knowledgeMediaSent = false;
    if (media?.file_path) {
      const {
        knowledgeWhatsappDocumentCaption,
        knowledgeWhatsappDocumentFilename,
      } = await import("@/lib/knowledge.server");
      const waCaption = knowledgeWhatsappDocumentCaption(media.caption, media.title);
      const waFilename =
        media.delivery === "document"
          ? knowledgeWhatsappDocumentFilename(media.filename, media.title)
          : media.filename;
      const bytes = await downloadKnowledgeMediaBytes(media.file_path);
      await new Promise((r) => setTimeout(r, 300));
      let chatMediaPath: string | undefined;
      const chatMime =
        media.delivery === "document" ? "application/pdf" : imageMimeFromFilename(media.filename);
      const chatKind = media.delivery === "document" ? "document" : "image";
      if (bytes && bytes.length > 0) {
        try {
          chatMediaPath = await storeChatMedia(msg.phone, bytes, chatMime, chatKind);
        } catch (e) {
          console.error("[chat-media] mídia outbound:", e);
        }
      }
      let sendRes: { ok: boolean; reason?: string; messageId?: string };
      if (bytes && bytes.length > 0) {
        sendRes =
          media.delivery === "document"
            ? await sendWhatsAppDocumentBytes(
                waTarget,
                msg.phone,
                bytes,
                waFilename,
                waCaption,
              )
            : await sendWhatsAppImageBytes(
                waTarget,
                msg.phone,
                bytes,
                media.filename,
                media.caption ?? undefined,
                imageMimeFromFilename(media.filename),
              );
      } else {
        const url = await signedKnowledgeMediaUrl(media.file_path);
        sendRes = url
          ? media.delivery === "document"
            ? await sendWhatsAppDocument(
                waTarget,
                msg.phone,
                url,
                waFilename,
                waCaption,
              )
            : await sendWhatsAppImage(
                waTarget,
                msg.phone,
                url,
                media.caption ?? undefined,
              )
          : { ok: false, reason: "storage_missing" };
      }
      if (sendRes.ok) {
        knowledgeMediaSent = true;
        if (media.delivery === "document") {
          await markQuoteSent(session.id).catch((e) => console.error("[crm] orçamento", e));
        }
        await persistMessage(
          session.id,
          "out",
          "bot",
            waCaption || (media.delivery === "document" ? "📎 Documento" : `📎 ${media.title}`),
          {
            knowledge_doc_id: media.id,
            media_kind: chatKind,
            media_mime: chatMime,
            filename: waFilename,
            ...(chatMediaPath ? { media_path: chatMediaPath } : {}),
            ...(sendRes.messageId
              ? { wa_message_id: sendRes.messageId, delivery_status: "sent" }
              : {}),
          },
        );
      } else {
        console.error("[meta] mídia base conhecimento:", sendRes.reason);
        await sendWhatsAppText(
          waTarget,
          msg.phone,
          "Não consegui enviar o arquivo agora. Peça de novo em instantes ou fale com um atendente.",
        );
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

    if (!knowledgeMediaSent) {
      const { pickSendableKnowledgeLink } = await import("@/lib/knowledge.server");
      const { formatKnowledgeLinkWhatsAppMessage } = await import("@/lib/knowledge-outbound");
      const link = await pickSendableKnowledgeLink(msg.text, msg.organizationId, 2, sentUrls);
      if (
        link &&
        !replies.some((r) => r.includes(link.url)) &&
        !sentUrls.has(normalizeOutboundUrl(link.url))
      ) {
        const linkMsg = formatKnowledgeLinkWhatsAppMessage(link.title, link.url);
        const linkRowId = await persistMessage(session.id, "out", "bot", linkMsg, {
          knowledge_link: link.url,
        });
        await new Promise((r) => setTimeout(r, 300));
        const linkRes = await sendWhatsAppText(waTarget, msg.phone, linkMsg, {
          previewUrl: true,
        }).catch((e) => ({ ok: false, reason: String(e) }) as const);
        if (!linkRes.ok) {
          console.error("[meta] link falhou:", linkRes.reason);
          await markOutboundDeliveryFailed(linkRowId, linkRes.reason ?? "meta_link_failed");
        } else {
          await attachWaMessageId(linkRowId, "messageId" in linkRes ? linkRes.messageId : undefined);
        }
      }
    }
  }

  if (handoff) {
    const { generateDossie } = await import("@/lib/dossie.server");
    await generateDossie(session.id).catch((e) => console.error("[dossie] falhou:", e));
    if (!ownerAlertSent) {
      const offerLeft = groupOfferFromIntake(session.intake_data);
      if (offerLeft && !offerLeft.alerted_at) {
        offerLeft.alerted_at = new Date().toISOString();
        const patch = { ...(session.intake_data ?? {}), group_offer: offerLeft };
        await supabaseAdmin
          .from("sessions")
          .update({ intake_data: patch as never })
          .eq("id", session.id);
        await notifyOwnerGroupOffer(msg, session.id, offerLeft).catch((e) =>
          console.error("[alerta-oferta] falhou:", e),
        );
      } else {
        await notifyOwner(msg, session.id).catch((e) => console.error("[alerta] falhou:", e));
      }
    }
  }

  return { replies, sessionId: session.id };
}

function imageMimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}