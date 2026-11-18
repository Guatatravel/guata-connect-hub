/**
 * Contexto de templates Meta para histórico da IA e respostas a botões (SIM/NÃO).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TEMPLATE_REPLY_WINDOW_MS = 72 * 60 * 60 * 1000;

export function renderTemplateBodyPlaceholders(body: string, firstName?: string): string {
  const name = firstName?.trim() || "olá";
  return body.replaceAll("{{1}}", name).replaceAll("{nome}", name).trim();
}

export function quickReplyLabelsFromComponents(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const out: string[] = [];
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const type = String((c as { type?: string }).type ?? "").toUpperCase();
    if (type !== "BUTTONS") continue;
    const buttons = (c as { buttons?: unknown[] }).buttons;
    if (!Array.isArray(buttons)) continue;
    for (const b of buttons) {
      if (!b || typeof b !== "object") continue;
      if (String((b as { type?: string }).type ?? "").toUpperCase() !== "QUICK_REPLY") continue;
      const text = String((b as { text?: string }).text ?? "").trim();
      if (text) out.push(text);
    }
  }
  return out;
}

export async function lookupWhatsappTemplateRow(
  organizationId: string,
  name: string,
  language: string,
): Promise<{ body_text: string; quickReplies: string[] } | null> {
  const lang = language.trim() || "pt_BR";
  const pick = async (languageFilter: boolean) => {
    let q = supabaseAdmin
      .from("whatsapp_templates")
      .select("body_text, components, language")
      .eq("organization_id", organizationId)
      .eq("name", name);
    if (languageFilter) q = q.eq("language", lang);
    return q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  };
  const { data: exact } = await pick(true);
  const row = exact ?? (await pick(false)).data;
  if (!row) return null;
  const body_text = String(row.body_text ?? "").trim();
  const quickReplies = quickReplyLabelsFromComponents(row.components);
  return { body_text, quickReplies };
}

export async function lookupWhatsappTemplateBody(
  organizationId: string,
  name: string,
  language: string,
): Promise<string | null> {
  const row = await lookupWhatsappTemplateRow(organizationId, name, language);
  return row?.body_text ?? null;
}

export async function lookupTemplateQuickReplies(
  organizationId: string,
  name: string,
  language: string,
): Promise<string[]> {
  const row = await lookupWhatsappTemplateRow(organizationId, name, language);
  return row?.quickReplies ?? [];
}

/** Texto gravado no histórico / enviado à IA (não é o cartão visual da Meta). */
export function templateHistoryText(input: {
  templateName: string;
  bodyText: string;
  campaignNote?: string;
  quickReplies?: string[];
}): string {
  const body = input.bodyText.trim();
  const note = input.campaignNote?.trim();
  let text = `[Template oficial "${input.templateName}" enviado ao cliente]\n${body}`;
  if (note) text += `\n\nNota da campanha: ${note}`;
  if (input.quickReplies?.length) {
    text += `\n\nBotões do modelo: ${input.quickReplies.join(", ")}.`;
  }
  text += "\n\nA próxima mensagem do cliente é resposta a este modelo.";
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

function isDeclineQuickReplyLabel(label: string): boolean {
  const l = normalizeTemplateButtonText(label);
  return (
    /^(n(ã|a)o|no|negativo|n)\b/.test(l) ||
    l.includes("não quero") ||
    l.includes("nao quero") ||
    l.includes("agora não")
  );
}

function isAcceptQuickReplyLabel(label: string): boolean {
  const l = normalizeTemplateButtonText(label);
  return /^(sim|s|yes|ok|quero|aceito|claro|bora)\b/.test(l);
}

export function matchesTemplateQuickReply(
  text: string,
  labels: string[],
): { kind: "accept" | "decline"; label: string } | null {
  const t = normalizeTemplateButtonText(text);
  for (const raw of labels) {
    if (normalizeTemplateButtonText(raw) !== t) continue;
    if (isDeclineQuickReplyLabel(raw)) return { kind: "decline", label: raw };
    if (isAcceptQuickReplyLabel(raw)) return { kind: "accept", label: raw };
    return { kind: "accept", label: raw };
  }
  return null;
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

/** Recusa em texto livre logo após um modelo (sem clicar no botão). */
export function isTextualDeclineAfterTemplate(text: string): boolean {
  const t = normalizeTemplateButtonText(text);
  if (t.length > 120) return false;
  if (isTemplateButtonDecline(text)) return true;
  return /^(não quero|nao quero|agora não|agora nao|deixa|sem interesse|não obrigado|nao obrigado|prefiro não|melhor não|não preciso|nao preciso)\b/.test(
    t,
  );
}

export function templateBodyIsInvitation(body: string): boolean {
  return /família guatá|salvar.*contato|posso salvar|fazer parte|boas-vindas/i.test(body);
}

export interface RecentTemplateContext {
  templateName: string;
  bodyText: string;
  sentAt: string;
  quickReplies: string[];
}

export type TemplateUserReplyKind = "accept" | "decline" | "follow_up";

export function classifyTemplateUserReply(
  userText: string,
  ctx: RecentTemplateContext,
): TemplateUserReplyKind {
  const quick = matchesTemplateQuickReply(userText, ctx.quickReplies);
  if (quick?.kind === "decline") return "decline";
  if (quick?.kind === "accept") return "accept";

  if (ctx.quickReplies.length === 0) {
    if (isTextualDeclineAfterTemplate(userText) && templateBodyIsInvitation(ctx.bodyText)) {
      return "decline";
    }
    return "follow_up";
  }

  if (isTemplateButtonDecline(userText)) return "decline";
  if (isTemplateButtonAccept(userText)) return "accept";
  if (isTextualDeclineAfterTemplate(userText)) return "decline";
  return "follow_up";
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

    let quickReplies = Array.isArray(meta.template_quick_replies)
      ? (meta.template_quick_replies as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [];

    let bodyText =
      String(meta.template_body ?? "").trim() ||
      (typeof row.text === "string" && row.text.includes("[Template oficial") ? row.text : "");

    const { data: sess } = await supabaseAdmin
      .from("sessions")
      .select("organization_id")
      .eq("id", sessionId)
      .maybeSingle();
    const lang = String(meta.template_language ?? "pt_BR");
    const orgId = sess?.organization_id as string | undefined;

    if (orgId) {
      if (!bodyText || quickReplies.length === 0) {
        const rowTpl = await lookupWhatsappTemplateRow(orgId, templateName, lang);
        if (rowTpl) {
          if (!bodyText) bodyText = rowTpl.body_text;
          if (quickReplies.length === 0) quickReplies = rowTpl.quickReplies;
        }
      }
    }

    if (!bodyText) {
      bodyText = `Modelo "${templateName}" enviado ao cliente (cartão oficial na Meta).`;
    }

    return {
      templateName,
      bodyText: bodyText.slice(0, 4000),
      sentAt,
      quickReplies,
    };
  }
  return null;
}

export function templateAcceptPromptSection(ctx: RecentTemplateContext): string {
  const buttons =
    ctx.quickReplies.length > 0
      ? ` Botões do modelo: ${ctx.quickReplies.join(", ")}.`
      : "";
  const invitation = templateBodyIsInvitation(ctx.bodyText);
  const inviteExtra = invitation
    ? "- O cliente aceitou o convite do modelo (salvar contato / família / participar): boas-vindas curtas; não repita o textão do cartão.\n"
    : "";
  return (
    `\n\n## RESPOSTA AO TEMPLATE "${ctx.templateName}"\n` +
    `O cliente respondeu de forma afirmativa ao modelo enviado.${buttons}\n` +
    `Texto do modelo:\n${ctx.bodyText}\n` +
    "- Continue **no assunto deste modelo** (não mude para outro tema sem motivo).\n" +
    "- Não cumprimente de novo como primeira mensagem.\n" +
    inviteExtra
  );
}

export function templateFollowUpPromptSection(ctx: RecentTemplateContext, userText: string): string {
  const buttons =
    ctx.quickReplies.length > 0
      ? ` O modelo tinha botões: ${ctx.quickReplies.join(", ")}.`
      : " Este modelo não tinha botões — o cliente respondeu em texto livre.";
  return (
    `\n\n## CONTINUAÇÃO DO TEMPLATE "${ctx.templateName}"\n` +
    `O cliente acabou de responder após receber este modelo oficial.${buttons}\n` +
    `Texto do modelo:\n${ctx.bodyText}\n` +
    `Mensagem do cliente agora: "${userText.slice(0, 400)}"\n` +
    "- Interprete a mensagem como **resposta ao modelo**, não como conversa nova solta.\n" +
    "- Não repita o cartão inteiro; responda ao que ele trouxe sobre o convite/tema.\n" +
    "- Se a mensagem for recusa ou desinteresse, não insista em venda.\n"
  );
}

export function templateDeclineReply(ctx: RecentTemplateContext, firstName?: string): string {
  const n = firstName?.trim();
  const invitation = templateBodyIsInvitation(ctx.bodyText) || /convite/i.test(ctx.templateName);
  if (invitation) {
    return n
      ? `Tudo bem, ${n}! Sem problema — não vou insistir agora. Quando quiser falar de viagem ou turismo, é só mandar um oi.`
      : "Tudo bem! Sem problema — não vou insistir agora. Quando quiser falar de viagem ou turismo, é só mandar um oi.";
  }
  return n
    ? `Sem problema, ${n}! Qualquer coisa sobre o que enviamos, é só chamar. Quando quiser, mando um oi e seguimos.`
    : "Sem problema! Qualquer coisa sobre o que enviamos, é só chamar.";
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
      const quickReplies = Array.isArray(meta.template_quick_replies)
        ? (meta.template_quick_replies as unknown[]).map((x) => String(x))
        : undefined;
      return templateHistoryText({
        templateName: String(meta.template_name ?? "modelo"),
        bodyText: stored,
        campaignNote: note || undefined,
        quickReplies,
      });
    }
  }
  const followTpl = String(meta.template_name ?? "").trim();
  if (meta.follow_up && followTpl && text) return text;
  return text;
}