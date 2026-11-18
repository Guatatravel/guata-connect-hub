/**
 * Contexto de templates Meta para histórico da IA e respostas a botões (SIM/NÃO).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TEMPLATE_REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

export function renderTemplateBodyPlaceholders(body: string, firstName?: string): string {
  const name = firstName?.trim() || "olá";
  return body.replaceAll("{{1}}", name).replaceAll("{nome}", name).trim();
}

export async function lookupWhatsappTemplateBody(
  organizationId: string,
  name: string,
  language: string,
): Promise<string | null> {
  const lang = language.trim() || "pt_BR";
  const { data: exact } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("body_text")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .eq("language", lang)
    .maybeSingle();
  if (exact?.body_text?.trim()) return exact.body_text.trim();
  const { data: anyLang } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("body_text")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return anyLang?.body_text?.trim() || null;
}

/** Texto gravado no histórico / enviado à IA (não é o cartão visual da Meta). */
export function templateHistoryText(input: {
  templateName: string;
  bodyText: string;
  campaignNote?: string;
}): string {
  const body = input.bodyText.trim();
  const note = input.campaignNote?.trim();
  let text = `[Template oficial "${input.templateName}" enviado ao cliente]\n${body}`;
  if (note) text += `\n\nNota da campanha: ${note}`;
  text +=
    "\n\nO cliente vê este convite na Meta (com botões rápidos quando o modelo tiver). Respostas comuns: SIM ou NÃO.";
  return text.slice(0, 4000);
}

export function panelPreviewForTemplate(templateName: string, bodyText: string, firstName?: string): string {
  const body = renderTemplateBodyPlaceholders(bodyText, firstName);
  const firstLine = body.split(/\n/)[0]?.trim() || `Template ${templateName}`;
  const snippet = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  return `Template ${templateName}: ${snippet}`;
}

/** Linha de preview na lista de conversas e na timeline do painel. */
export function panelMessagePreview(text: string, metadata?: Record<string, unknown> | null): string {
  const meta = metadata ?? {};
  const kind = String(meta.kind ?? "");
  const name = String(meta.template_name ?? "").trim();
  const body = String(meta.template_body ?? "").trim();
  if (kind === "campaign_template" || body || name) {
    if (body) {
      const line = body.split(/\n/).find((l) => l.trim())?.trim() ?? body;
      const snippet = line.length > 100 ? `${line.slice(0, 97)}…` : line;
      return name ? `Modelo «${name}»: ${snippet}` : `Modelo Meta: ${snippet}`;
    }
    if (name && /^template\s+/i.test(text.trim())) {
      return `Modelo «${name}» (cartão no WhatsApp do cliente)`;
    }
  }
  return text;
}

export function normalizeTemplateButtonText(text: string): string {
  return text
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isTemplateButtonDecline(text: string): boolean {
  const t = normalizeTemplateButtonText(text);
  return (
    /^(n(ã|a)o|no|n)([!?.…\s]*)$/.test(t) ||
    t === "nao" ||
    t === "não" ||
    /^no\b/.test(t)
  );
}

export function isTemplateButtonAccept(text: string): boolean {
  const t = normalizeTemplateButtonText(text);
  return /^(sim|s|yes|ok|claro)([!?.…\s]*)$/.test(t);
}

export interface RecentTemplateContext {
  templateName: string;
  bodyText: string;
  sentAt: string;
}

export async function findRecentTemplateForSession(sessionId: string): Promise<RecentTemplateContext | null> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("text, metadata, created_at")
    .eq("session_id", sessionId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(24);
  const cutoff = Date.now() - TEMPLATE_REPLY_WINDOW_MS;
  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const kind = String(meta.kind ?? "");
    const templateName = String(meta.template_name ?? "").trim();
    if (kind !== "campaign_template" && !templateName) continue;
    const sentAt = String(row.created_at ?? "");
    if (sentAt && new Date(sentAt).getTime() < cutoff) continue;
    if (!templateName) continue;
    let bodyText =
      String(meta.template_body ?? "").trim() ||
      (typeof row.text === "string" && row.text.includes("[Template oficial")
        ? row.text
        : "");
    if (!bodyText) {
      const { data: sess } = await supabaseAdmin
        .from("sessions")
        .select("organization_id")
        .eq("id", sessionId)
        .maybeSingle();
      const lang = String(meta.template_language ?? "pt_BR");
      if (sess?.organization_id) {
        bodyText =
          (await lookupWhatsappTemplateBody(
            sess.organization_id as string,
            templateName,
            lang,
          )) ?? "";
      }
    }
    if (!bodyText) {
      bodyText = `Convite modelo "${templateName}" (cartão com botões SIM/NÃO na Meta).`;
    }
    return { templateName, bodyText: bodyText.slice(0, 4000), sentAt };
  }
  return null;
}

export function templateAcceptPromptSection(ctx: RecentTemplateContext): string {
  const convite = /convite/i.test(ctx.templateName);
  const conviteExtra = convite
    ? "- O cliente aceitou fazer parte da Família Guatá / salvar o contato: dê boas-vindas curtas e pergunte se prefere começar por dicas turísticas ou já tem uma viagem em mente.\n"
    : "";
  return (
    `\n\n## RESPOSTA AO TEMPLATE "${ctx.templateName}"\n` +
    `O cliente acabou de tocar em SIM (ou equivalente) no modelo enviado. Contexto do modelo:\n${ctx.bodyText}\n` +
    "- Continue o assunto **deste convite** (não mude para outro tema genérico sem necessidade).\n" +
    "- Não repita a apresentação longa do cartão; vá direto ao próximo passo natural (pergunta, roteiro, convite suave).\n" +
    "- Não cumprimente de novo como se fosse a primeira mensagem.\n" +
    conviteExtra
  );
}

export function templateDeclineReply(templateName: string, firstName?: string): string {
  const n = firstName?.trim();
  const convite = /convite/i.test(templateName);
  if (convite) {
    return n
      ? `Tudo bem, ${n}! Sem problema — não vou insistir em salvar o contato agora. Quando quiser falar de viagem ou turismo, é só mandar um oi.`
      : "Tudo bem! Sem problema — não vou insistir em salvar o contato agora. Quando quiser falar de viagem ou turismo, é só mandar um oi.";
  }
  return n
    ? `Sem problema, ${n}! Fico por aqui quando quiser falar de viagem ou turismo. É só mandar um oi.`
    : "Sem problema! Fico por aqui quando quiser falar de viagem ou turismo. É só mandar um oi.";
}

export function historyContentFromRow(
  text: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  const meta = metadata ?? {};
  const kind = String(meta.kind ?? "");
  if (kind === "campaign_template" || meta.template_body) {
    const stored = String(meta.template_body ?? "").trim();
    if (stored) {
      const note =
        typeof text === "string" && text && !text.startsWith("[Template oficial") ? `\nNota: ${text}` : "";
      return templateHistoryText({
        templateName: String(meta.template_name ?? "modelo"),
        bodyText: stored,
        campaignNote: note || undefined,
      });
    }
  }
  const followTpl = String(meta.template_name ?? "").trim();
  if (meta.follow_up && followTpl && text) return text;
  return text;
}