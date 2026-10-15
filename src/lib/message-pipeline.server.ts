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
import { sendWhatsAppText, markReadAndTyping, typingDelayMs } from "@/lib/meta-send.server";

export interface IncomingMessage {
  line: "descubra" | "viagens";
  phone: string;
  contactName?: string;
  text: string;
  messageId?: string;
  inboundKind?: "text" | "image" | "audio" | "unsupported";
}

interface SessionRow {
  id: string;
  mode: "bot" | "humano" | "triagem" | "aguardando";
  intake_state: string | null;
  intake_data: Record<string, unknown>;
}

async function loadOrCreateSession(
  line: "descubra" | "viagens",
  phone: string,
  contactName?: string,
): Promise<SessionRow> {
  const { data: existing } = await supabaseAdmin
    .from("sessions")
    .select("id, mode, intake_state, intake_data")
    .eq("line", line)
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return existing as unknown as SessionRow;
  const { data: created, error } = await supabaseAdmin
    .from("sessions")
    .insert({ line, phone, contact_name: contactName ?? null, mode: "bot" })
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

async function startIntake(sessionId: string): Promise<string> {
  await supabaseAdmin
    .from("sessions")
    .update({ mode: "triagem", intake_state: "origem", intake_data: {} })
    .eq("id", sessionId);
  return `Vamos montar sua viagem! ${STEP_PROMPT.origem}\n\n(digite "menu" para voltar)`;
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
    .update({ mode: "aguardando", intake_state: null })
    .eq("id", session.id);

  return `Triagem registrada! Protocolo ${protocol}. Um consultor entrará em contato em breve.`;
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
): Promise<AttendantConfig | null> {
  const { data } = await supabaseAdmin
    .from("attendants")
    .select("persona, criatividade, modelo, usa_base_local, usa_base_descubra")
    .eq("line", line)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return (data as unknown as AttendantConfig) ?? null;
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
): Promise<string> {
  const attendant = await loadAttendant(line);
  const official = line === "descubra" ? await getGuataPersona() : null;
  const persona =
    official ||
    attendant?.persona ||
    "Você é o Guatá, assistente turístico de Mato Grosso do Sul. Respostas curtas, calorosas e úteis. Viagens e pacotes personalizados: Guatá Viagens e Turismo.";

  let context = "";

  // Base de conhecimento própria (documentos, textos e links anexados no painel)
  if (attendant?.usa_base_local !== false) {
    const { searchLocalKnowledge } = await import("@/lib/knowledge.server");
    const local = await searchLocalKnowledge(userText, 3).catch(() => []);
    if (local.length > 0) {
      context +=
        "\n\nDocumentos da empresa (use como fonte principal):\n" +
        local.map((d) => `### ${d.title}\n${d.excerpt}`).join("\n\n");
    }
  }

  const kb =
    attendant?.usa_base_descubra === false
      ? []
      : await searchGuataKnowledgeBase(userText, 3);
  if (kb.length > 0) {
    context +=
      "\n\nBase de conhecimento Descubra MS:\n" +
      kb.map((k) => `- ${k.question}: ${k.answer}`).join("\n");
  } else if (!context && isDescubraConfigured()) {
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
  const whatsappRules =
    "\n\n## IDIOMA\n- Responda SEMPRE no mesmo idioma da última mensagem do cliente (português, inglês, espanhol etc.).\n" +
    "\n## MS E AGÊNCIA\n- Você é o Guatá: foco e carinho por Mato Grosso do Sul (dicas, roteiros, atrativos, eventos, cultura).\n- NUNCA diga que não pode ajudar com passeio personalizado, pacote, viagem sob medida, hospedagem, orçamento ou destino fora de MS. Isso é com a *Guatá Viagens e Turismo* — acolha, oriente e convide a agência a montar o que o cliente quiser.\n- Pode sugerir roteiros em MS com entusiasmo. Para fechar, reservar ou personalizar: Guatá Viagens.\n- Parceiros do Descubra MS no contexto podem ser recomendados.\n" +
    "\n## CONSULTOR HUMANO\n- NUNCA transfira por conta própria. Só ofereça um consultor quando o cliente demonstrar intenção clara de comprar/reservar/fechar, ou quando você realmente não souber resolver.\n- Ao oferecer, PERGUNTE diretamente (ex.: 'Quer que eu chame um consultor da Guatá Viagens para falar com você?') e termine a mensagem com o marcador [[OFERTA_HUMANO]].\n" +
    "\n## CANAL WHATSAPP\n- Uma ideia por mensagem: no máximo ~4 linhas curtas (~300 caracteres no total).\n- Se faltar espaço, priorize o essencial e convide a pessoa a pedir mais detalhe na sequência.\n- Tom de conversa natural. NÃO use markdown (sem ** ou ##). Destaque com no máximo *uma* palavra em asterisco.\n- Listas curtas com '• ' (máx. 3 itens). Sem menus numerados.\n" +
    (ongoing
      ? "- A conversa JÁ está em andamento: NÃO cumprimente de novo (sem 'Olá', 'Oi', 'Que pergunta ótima'). Vá direto ao ponto.\n"
      : "- Se for só um cumprimento, cumprimente uma vez de forma calorosa e pergunte como pode ajudar, sem listas.\n") +
    (firstName
      ? `- O cliente se chama ${firstName}. Use o primeiro nome de forma natural, no máximo uma vez, sem repetir em toda mensagem.\n`
      : "");

  const raw = await chatCompletion(
    [{ role: "system", content: persona + context + whatsappRules }, ...history],
    {
      maxTokens: 320,
      temperature: attendant?.criatividade ?? 0.6,
      model: attendant?.modelo || undefined,
    },
  );
  return formatForWhatsApp(raw);
}

export function formatForWhatsApp(text: string): string {
  return text
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Limite por balão no WhatsApp (várias mensagens seguidas). */
const WHATSAPP_BUBBLE_MAX = 380;
const WHATSAPP_BUBBLE_MAX_COUNT = 4;

/**
 * Divide texto longo em vários balões curtos (parágrafos / linhas).
 */
export function splitWhatsAppMessages(text: string): string[] {
  const cleaned = formatForWhatsApp(text);
  if (!cleaned) return [];

  if (cleaned.length <= WHATSAPP_BUBBLE_MAX) return [cleaned];

  const bubbles: string[] = [];
  let current = "";

  const flush = () => {
    const t = current.trim();
    if (t) bubbles.push(t);
    current = "";
  };

  const appendChunk = (chunk: string) => {
    const part = chunk.trim();
    if (!part) return;
    if (part.length > WHATSAPP_BUBBLE_MAX) {
      const sentences = part.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (!s) continue;
        if (s.length > WHATSAPP_BUBBLE_MAX) {
          flush();
          bubbles.push(s.slice(0, WHATSAPP_BUBBLE_MAX - 1) + "…");
          continue;
        }
        const joiner = current ? " " : "";
        if ((current + joiner + s).length > WHATSAPP_BUBBLE_MAX) {
          flush();
          current = s;
        } else {
          current = current ? current + " " + s : s;
        }
      }
      return;
    }
    const joiner = current ? "\n\n" : "";
    if ((current + joiner + part).length > WHATSAPP_BUBBLE_MAX) {
      flush();
      current = part;
    } else {
      current = current ? current + "\n\n" + part : part;
    }
  };

  for (const para of cleaned.split(/\n\n+/)) {
    for (const line of para.split(/\n/)) {
      appendChunk(line);
    }
  }
  flush();

  const out = bubbles.filter(Boolean).slice(0, WHATSAPP_BUBBLE_MAX_COUNT);
  if (bubbles.length > WHATSAPP_BUBBLE_MAX_COUNT && out.length > 0) {
    const last = out[out.length - 1];
    if (!last.endsWith("?")) {
      out[out.length - 1] = `${last}\n\nQuer que eu detalhe algum ponto?`;
    }
  }
  return out.length ? out : [cleaned.slice(0, WHATSAPP_BUBBLE_MAX)];
}

/**
 * Processa uma mensagem recebida. Persiste e retorna o(s) texto(s) a enviar.
 */
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
  const res = await sendWhatsAppText(msg.line, owner, text);
  if (!res.ok) console.error("[alerta] envio falhou:", res.reason);
}

export async function processMessage(
  msg: IncomingMessage,
): Promise<{ replies: string[]; sessionId: string }> {
  if (msg.messageId) void markReadAndTyping(msg.line, msg.messageId);
  const session = await loadOrCreateSession(msg.line, msg.phone, msg.contactName);
  await persistMessage(session.id, "in", "user", msg.text, {
    inbound_kind: msg.inboundKind ?? "text",
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
      ...(session.mode === "triagem" || session.mode === "aguardando"
        ? { mode: "bot" as const, intake_state: null }
        : {}),
    })
    .eq("id", session.id);

  const explicitHuman =
    /\b(humano|atendente|consultor|falar com (uma )?pessoa|pessoa real|human agent|speak to (a )?human|hablar con (una )?persona|agente humano)\b/i.test(lower);
  const affirmative =
    /^(sim|s|quero|pode|pode sim|claro|ok|okay|por favor|bora|isso|yes|yeah|sure|sí|si|vale)\b/i.test(lower);

  const goHuman = async () => {
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano", intake_state: null })
      .eq("id", session.id);
    replies.push(handoffText);
  };

  if (session.mode === "humano") {
    // Não responde — consultor responde no painel
  } else if (explicitHuman || (offered && affirmative)) {
    await goHuman();
  } else {
    if (offered) {
      await supabaseAdmin.from("sessions").update({ intake_state: null }).eq("id", session.id);
    }
    try {
      const raw = await answerTurismo(msg.text, msg.line, session.id, firstName);
      const offer = raw.includes("[[OFERTA_HUMANO]]");
      if (offer) {
        await supabaseAdmin
          .from("sessions")
          .update({ intake_state: "oferta_humano" })
          .eq("id", session.id);
      }
      const body = raw.replace(/\[\[OFERTA_HUMANO\]\]/g, "").trim();
      replies.push(...splitWhatsAppMessages(body));
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

  // Persiste e envia
  for (const text of replies) {
    await persistMessage(session.id, "out", "bot", text);
    await new Promise((r) => setTimeout(r, typingDelayMs(text)));
    const res = await sendWhatsAppText(msg.line, msg.phone, text).catch(
      (e) => ({ ok: false, reason: String(e) }) as const,
    );
    if (!res.ok) console.error("[meta] send falhou:", res.reason);
    else console.log("[meta] enviado:", "messageId" in res ? res.messageId : "");
  }

  if (handoff) {
    const { generateDossie } = await import("@/lib/dossie.server");
    await generateDossie(session.id).catch((e) => console.error("[dossie] falhou:", e));
    await notifyOwner(msg, session.id).catch((e) => console.error("[alerta] falhou:", e));
  }

  return { replies, sessionId: session.id };
}