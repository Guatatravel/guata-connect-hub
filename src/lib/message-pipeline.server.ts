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
import { chatCompletion, classifyIntent } from "@/lib/ai-gateway.server";
import { sendWhatsAppText } from "@/lib/meta-send.server";

export interface IncomingMessage {
  line: "descubra" | "viagens";
  phone: string;
  contactName?: string;
  text: string;
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
) {
  await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction,
    author,
    text,
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
    status: "aberta",
  });
  await supabaseAdmin
    .from("sessions")
    .update({ mode: "aguardando", intake_state: null })
    .eq("id", session.id);

  return `Triagem registrada! Protocolo ${protocol}. Um consultor entrará em contato em breve.`;
}

async function answerTurismo(userText: string): Promise<string> {
  const persona =
    (await getGuataPersona()) ??
    "Você é o Guatá, assistente turístico oficial de Mato Grosso do Sul. Responda de forma calorosa, objetiva e útil.";

  const kb = await searchGuataKnowledgeBase(userText, 3);
  let context = "";
  if (kb.length > 0) {
    context =
      "\n\nBase de conhecimento:\n" +
      kb.map((k) => `- ${k.question}: ${k.answer}`).join("\n");
  } else if (isDescubraConfigured()) {
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

  return chatCompletion(
    [
      { role: "system", content: persona + context },
      { role: "user", content: userText },
    ],
    { maxTokens: 500, temperature: 0.6 },
  );
}

const MENU_TEXT =
  "Como posso ajudar?\n1. Dicas de viagem em MS\n2. Montar um pacote (agência)\n3. Falar com humano\n\n(responda com o número ou descreva)";

/**
 * Processa uma mensagem recebida. Persiste e retorna o(s) texto(s) a enviar.
 */
export async function processMessage(
  msg: IncomingMessage,
): Promise<{ replies: string[]; sessionId: string }> {
  const session = await loadOrCreateSession(msg.line, msg.phone, msg.contactName);
  await persistMessage(session.id, "in", "user", msg.text);

  const lower = msg.text.trim().toLowerCase();
  const replies: string[] = [];

  // Comandos globais
  if (lower === "menu" || lower === "voltar") {
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "bot", intake_state: null })
      .eq("id", session.id);
    replies.push(MENU_TEXT);
  } else if (lower === "humano" || lower === "atendente") {
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano" })
      .eq("id", session.id);
    replies.push("Ok! Um consultor humano vai assumir esta conversa em instantes.");
  } else if (session.mode === "humano") {
    // Não responde — consultor responde no painel
  } else if (session.mode === "triagem") {
    replies.push(await continueIntake(session, msg.text));
  } else if (lower === "2" || /pacote|or[çc]amento|reserva/.test(lower)) {
    replies.push(await startIntake(session.id));
  } else {
    const intent = await classifyIntent(msg.text).catch(() => "turismo_geral" as const);
    if (intent === "humano") {
      await supabaseAdmin
        .from("sessions")
        .update({ mode: "humano" })
        .eq("id", session.id);
      replies.push("Ok! Um consultor humano vai assumir esta conversa em instantes.");
    } else if (intent === "agencia") {
      replies.push(await startIntake(session.id));
    } else if (intent === "saudacao") {
      replies.push(`Olá! ${MENU_TEXT}`);
    } else {
      try {
        replies.push(await answerTurismo(msg.text));
      } catch (err) {
        console.error("[brain] erro:", err);
        replies.push(
          "Tive um problema momentâneo. Pode reformular ou digitar 'humano' para falar com um consultor?",
        );
      }
    }
  }

  // Persiste e envia
  for (const text of replies) {
    await persistMessage(session.id, "out", "bot", text);
    await sendWhatsAppText(msg.line, msg.phone, text).catch((e) =>
      console.error("[meta] send falhou:", e),
    );
  }

  return { replies, sessionId: session.id };
}