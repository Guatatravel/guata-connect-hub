/**
 * Ofertas divulgadas no grupo / story: identificar pacote, confirmar e repassar ao consultor
 * sem inventar condição de pagamento.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TemplateUserReplyKind } from "@/lib/whatsapp-template-context.server";

export const GROUP_OFFER_INTAKE_STATE = "oferta_grupo";

export type GroupOfferStep = "ask_offer" | "confirm" | "done";

export type GroupOfferSource = "quote" | "story" | "cartaz" | "text" | "mixed";

export interface GroupOfferData {
  step: GroupOfferStep;
  source?: GroupOfferSource;
  quoted_text?: string;
  cartaz_summary?: string;
  offer_label?: string;
  payment_note?: string;
  referral_headline?: string;
  confirmed_at?: string;
  alerted_at?: string;
}

export interface GroupOfferIngress {
  quotedWaMessageId?: string;
  inboundKind?: string;
  text: string;
  referral?: {
    source_type?: string;
    headline?: string;
    body?: string;
  };
  quotedForwarded?: boolean;
}

const PAYMENT_RE =
  /\b(parcela|parcelamento|boleto|cart[aã]o|pix|entrada|sinal|financi|cr[eé]dito|vezes|\d\s*x|em\s*\d+\s*vezes|condi[cç][aã]o\s+de\s+pagamento|forma\s+de\s+pagamento)\b/i;

const GROUP_OFFER_TEXT_RE =
  /\b(grupo|story|stories|status|vi\s+no\s+grupo|vi\s+o\s+story|vi\s+seu\s+story|oferta|promo[cç][aã]o|sobre\s+essa\s+promo|cartaz|condi[cç][aã]o\s+especial|pacote\s+do\s+grupo|promo)\b/i;

export function mentionsPaymentTerms(text: string): boolean {
  return PAYMENT_RE.test(text.trim());
}

export function looksLikeGroupOfferText(text: string): boolean {
  return GROUP_OFFER_TEXT_RE.test(text.trim());
}

export function groupOfferFromIntake(intake: Record<string, unknown> | undefined): GroupOfferData | null {
  const raw = intake?.["group_offer"];
  if (!raw || typeof raw !== "object") return null;
  const g = raw as GroupOfferData;
  if (!g.step) return null;
  return g;
}

export function isActiveGroupOfferFlow(
  intakeState: string | null,
  intake: Record<string, unknown> | undefined,
): boolean {
  if (intakeState === GROUP_OFFER_INTAKE_STATE) return true;
  const g = groupOfferFromIntake(intake);
  return Boolean(g && g.step !== "done");
}

function mergeSource(
  current: GroupOfferSource | undefined,
  next: GroupOfferSource,
): GroupOfferSource {
  if (!current || current === next) return next;
  return "mixed";
}

const TEMPLATE_QUICK_REPLY =
  /^(sim|s|n[aã]o|nao|n|quero|não|yes|no)$/i;

/** Resposta a modelo aprovado (convite etc.) — não confundir com oferta do grupo. */
export function templateReplyBlocksGroupOffer(
  hasRecentTemplate: boolean,
  templateReplyKind: TemplateUserReplyKind | null,
  userText: string,
): boolean {
  if (!hasRecentTemplate) return false;
  if (templateReplyKind === "accept" || templateReplyKind === "decline") return true;
  return TEMPLATE_QUICK_REPLY.test(userText.trim());
}

export async function quotedMessageIsCampaignTemplate(
  sessionId: string,
  quotedWaMessageId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("session_id", sessionId)
    .filter("metadata->>wa_message_id", "eq", quotedWaMessageId)
    .limit(1)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as { kind?: string; template_name?: string };
  const kind = String(meta.kind ?? "");
  return kind === "campaign_template" || Boolean(meta.template_name);
}

/** Sinais de que esta mensagem é sobre oferta do grupo / story (não disparo do painel). */
export function shouldStartGroupOfferFlow(ingress: GroupOfferIngress): boolean {
  if (ingress.referral?.source_type || ingress.referral?.headline) return true;
  if (ingress.inboundKind === "image") return true;
  if (looksLikeGroupOfferText(ingress.text)) return true;
  if (ingress.quotedForwarded) return true;
  if (
    ingress.quotedWaMessageId &&
    (mentionsPaymentTerms(ingress.text) ||
      looksLikeGroupOfferText(ingress.text) ||
      ingress.inboundKind === "image")
  ) {
    return true;
  }
  if (
    mentionsPaymentTerms(ingress.text) &&
    ingress.text.length < 280 &&
    (ingress.quotedWaMessageId ||
      ingress.inboundKind === "image" ||
      looksLikeGroupOfferText(ingress.text))
  ) {
    return true;
  }
  return false;
}

function cartazSummaryFromInbound(text: string): string | undefined {
  const t = text.trim();
  if (!t || t.startsWith("(Cliente enviou")) return undefined;
  if (t.length < 8) return undefined;
  return t.slice(0, 500);
}

function pickSource(ingress: GroupOfferIngress): GroupOfferSource {
  const parts: GroupOfferSource[] = [];
  if (ingress.quotedWaMessageId) parts.push("quote");
  if (ingress.referral?.source_type || ingress.referral?.headline) parts.push("story");
  if (ingress.inboundKind === "image") parts.push("cartaz");
  if (parts.length === 0) return "text";
  if (parts.length === 1) return parts[0]!;
  return "mixed";
}

export async function resolveQuotedTextInSession(
  sessionId: string,
  quotedWaMessageId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("text")
    .eq("session_id", sessionId)
    .filter("metadata->>wa_message_id", "eq", quotedWaMessageId)
    .limit(1)
    .maybeSingle();
  const text = data?.text?.trim();
  return text || null;
}

export function quotePreviewWhenUnresolved(quotedForwarded?: boolean): string {
  if (quotedForwarded) {
    return "Mensagem citada (encaminhada — costuma ser do grupo; texto não espelhado no painel)";
  }
  return "Mensagem citada (texto não disponível no painel — pode ser do grupo)";
}

export function buildOwnerGroupOfferAlert(input: {
  contactName?: string;
  phone: string;
  sessionId: string;
  offer: GroupOfferData;
  lastUserText: string;
}): string {
  const phone = input.phone.replace(/\D/g, "");
  const src =
    input.offer.source === "quote"
      ? "Citou mensagem"
      : input.offer.source === "story"
        ? "Story / anúncio"
        : input.offer.source === "cartaz"
          ? "Enviou cartaz"
          : input.offer.source === "mixed"
            ? "Citação + cartaz / story"
            : "Texto (grupo / oferta)";
  const lines = [
    `🔔 *Oferta do grupo — consultor*`,
    `Nome: ${input.contactName ?? "Sem nome"}`,
    `Contato: +${phone}`,
    `Origem: ${src}`,
  ];
  if (input.offer.referral_headline) {
    lines.push(`Story/ref: ${input.offer.referral_headline.slice(0, 120)}`);
  }
  if (input.offer.quoted_text) {
    lines.push(`Citação no privado: ${input.offer.quoted_text.slice(0, 200)}`);
  }
  if (input.offer.cartaz_summary) {
    lines.push(`Cartaz (leitura): ${input.offer.cartaz_summary.slice(0, 220)}`);
  }
  if (input.offer.offer_label) {
    lines.push(`Oferta: ${input.offer.offer_label.slice(0, 200)}`);
  }
  if (input.offer.payment_note) {
    lines.push(`Pagamento: ${input.offer.payment_note.slice(0, 160)}`);
  }
  lines.push(`Última msg: ${input.lastUserText.slice(0, 280)}`);
  lines.push("");
  lines.push(`Painel: https://guata-connect-hub.lovable.app/conversas/${input.sessionId}`);
  lines.push(`WhatsApp: https://wa.me/${phone}`);
  lines.push("");
  lines.push(`Responda: 1 CONTINUAR (Guatá) | 2 ASSUMI (você atende)`);
  return lines.join("\n");
}

const AFFIRMATIVE =
  /^(sim|s|é|eh|e\s?isso|isso mesmo|confirmo|quero|pode|claro|ok|okay|bora|yes|yeah)\b/i;

function userTextLooksLikeOfferLabel(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 400) return false;
  if (/^(sim|n[aã]o|nao|ok|oi|ol[aá])\b/i.test(t)) return false;
  if (mentionsPaymentTerms(t) && t.split(/\s+/).length < 8) return false;
  return (
    /\b(pacote|viagem|destino|hotel|resort|[rR]\$\s*\d|oferta|[abc]\b)\b/.test(t) ||
    /\d{3,}/.test(t)
  );
}

export interface GroupOfferTurnResult {
  replies: string[];
  patchIntake: Record<string, unknown>;
  intakeState: string | null;
  handoffHuman: boolean;
  notifyOwner: boolean;
}

export async function handleGroupOfferTurn(input: {
  sessionId: string;
  firstName?: string;
  ingress: GroupOfferIngress;
  intake: Record<string, unknown>;
  intakeState: string | null;
}): Promise<GroupOfferTurnResult> {
  const { ingress, firstName, sessionId } = input;
  const offer: GroupOfferData = groupOfferFromIntake(input.intake) ?? { step: "ask_offer" };
  const userSaid = ingress.text.trim();
  const name = firstName ? `${firstName}, ` : "";

  if (ingress.quotedWaMessageId && !offer.quoted_text) {
    const quoted = await resolveQuotedTextInSession(sessionId, ingress.quotedWaMessageId);
    if (quoted) offer.quoted_text = quoted.slice(0, 400);
  }
  if (ingress.inboundKind === "image") {
    const summary = cartazSummaryFromInbound(ingress.text);
    if (summary) offer.cartaz_summary = summary;
  }
  if (ingress.referral?.headline || ingress.referral?.body) {
    offer.referral_headline = [ingress.referral.headline, ingress.referral.body]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 200);
  }
  offer.source = mergeSource(offer.source, pickSource(ingress));
  if (mentionsPaymentTerms(userSaid)) {
    offer.payment_note = userSaid.slice(0, 300);
  }

  const replies: string[] = [];
  let handoffHuman = false;
  let notifyOwner = false;
  let intakeState: string | null = GROUP_OFFER_INTAKE_STATE;

  const visualCandidate =
    offer.cartaz_summary?.split("\n")[0]?.trim() ||
    offer.quoted_text?.slice(0, 160) ||
    offer.referral_headline?.slice(0, 120);

  const finalizeHandoff = () => {
    offer.step = "done";
    offer.confirmed_at = offer.confirmed_at ?? new Date().toISOString();
    handoffHuman = true;
    notifyOwner = !offer.alerted_at;
    intakeState = null;
    if (notifyOwner) offer.alerted_at = new Date().toISOString();
  };

  if (offer.step === "confirm") {
    if (AFFIRMATIVE.test(userSaid)) {
      finalizeHandoff();
      replies.push(
        firstName
          ? `Perfeito, ${firstName}! Anotei *${(offer.offer_label ?? visualCandidate ?? "sua oferta").slice(0, 120)}* e já avisei nossa consultora. Ela te responde aqui em instantes com *pagamento e condições*. 😊`
          : `Perfeito! Anotei *${(offer.offer_label ?? visualCandidate ?? "sua oferta").slice(0, 120)}* e já avisei nossa consultora. Ela te responde em instantes com *pagamento e condições*. 😊`,
      );
    } else if (/^(n[aã]o|nao|n|outra|errad)/i.test(userSaid)) {
      offer.step = "ask_offer";
      offer.offer_label = undefined;
      replies.push(
        `Sem problema! Me diz qual *pacote* é — *nome*, *valor* ou manda o *cartaz* de novo.`,
      );
    } else {
      offer.offer_label = userSaid.slice(0, 300);
      replies.push(
        `Anotado: *${userSaid.slice(0, 160)}*. Confirma que é essa oferta? (sim/não)\n\nPagamento a consultora confirma depois.`,
      );
    }
  } else if (offer.step === "done") {
    handoffHuman = true;
    intakeState = null;
    if (!offer.alerted_at && userSaid.length > 0) {
      notifyOwner = true;
      offer.alerted_at = new Date().toISOString();
      offer.payment_note = offer.payment_note ?? userSaid.slice(0, 300);
    }
  } else {
    if (userTextLooksLikeOfferLabel(userSaid)) {
      offer.offer_label = userSaid.slice(0, 300);
      offer.step = "confirm";
      replies.push(
        `Entendi: *${userSaid.slice(0, 160)}*. É essa oferta do grupo? (sim/não)\n\nSobre *pagamento*, a consultora confirma certinho.`,
      );
    } else if (visualCandidate) {
      offer.offer_label = visualCandidate.slice(0, 300);
      offer.step = "confirm";
      replies.push(
        `${name}recebi sua mensagem sobre uma oferta do grupo. Pelo que entendi: *${visualCandidate.slice(0, 180)}*.\n\nÉ essa mesma? (sim/não)\n\nSobre *pagamento e condições especiais*, nossa consultora confirma — não invento valores aqui.`,
      );
    } else if (ingress.quotedWaMessageId || ingress.quotedForwarded) {
      replies.push(
        `${name}vi que você *respondeu citando* uma mensagem da oferta. Qual *pacote* é — pode mandar o *nome*, o *valor* ou o *cartaz*?`,
      );
    } else if (offer.referral_headline || offer.source === "story") {
      replies.push(
        `${name}que bom que você veio pelo story! Qual *oferta* ou *pacote* te interessou? Pode mandar o *nome*, o *valor* ou o *cartaz*.`,
      );
    } else {
      replies.push(
        `${name}vi que é sobre uma *oferta* do grupo ou story. Qual *pacote* você quer falar? Manda o *nome*, o *valor* ou o *cartaz*.`,
      );
    }

    if (
      mentionsPaymentTerms(userSaid) &&
      offer.offer_label &&
      offer.step === "confirm" &&
      !replies.length
    ) {
      finalizeHandoff();
      replies.push(
        `Registrei *${offer.offer_label.slice(0, 100)}* e sua dúvida de *pagamento*. A consultora te responde em instantes.`,
      );
    }
  }

  const patchIntake: Record<string, unknown> = {
    ...input.intake,
    group_offer: offer,
  };
  if (handoffHuman) {
    patchIntake["lead_stage"] = "quente";
    patchIntake["lead_updated_at"] = new Date().toISOString();
  }

  return { replies, patchIntake, intakeState, handoffHuman, notifyOwner };
}