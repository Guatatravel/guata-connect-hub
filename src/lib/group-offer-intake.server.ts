/**
 * Ofertas divulgadas no grupo / story / marcação: identificar pacote, confirmar,
 * briefing mastigado e só então repassar ao consultor — sem inventar condição de pagamento.
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
  /\b(parcela|parcelamento|boleto|cart[aã]o|pix|entrada|sinal|financi|cr[eé]dito|vezes|\d\s*x|em\s*\d+\s*vezes|condi[cç][aãõ]e?s?\s+de\s+pagamento|forma\s+de\s+pagamento)\b/i;

/** Citou grupo/story/cartaz / “dessa promoção” (marcação). */
const GROUP_OFFER_TEXT_RE =
  /\b(vi\s+no\s+grupo|vi\s+o\s+story|vi\s+seu\s+story|oferta\s+do\s+grupo|pacote\s+do\s+grupo|no\s+grupo|pelo\s+story|stories|story|cartaz|condi[cç][aã]o\s+especial|dessa\s+promo([cç][aã]o)?|dessa\s+oferta|desse\s+pacote|quero\s+(essa|desse|dessa)\s+(promo|promo([cç][aã]o)|oferta|pacote)|marcação|marcacao)\b/i;

/** Parece pacote/viagem (cartaz de turismo), não restaurante ou meme. */
const TRAVEL_OFFER_RE =
  /\b(pacote|viagem|turismo|destino|hotel|resort|cruzeiro|passeio|excurs[aã]o|roteiro|all[\s-]?inclusive|di[aá]rias?|hospedagem|a[eé]reo|passagem|transfer|bonito|pantanal|gramado|nordeste|ms\b|mato\s+grosso)\b/i;

export function mentionsPaymentTerms(text: string): boolean {
  return PAYMENT_RE.test(text.trim());
}

export function looksLikeGroupOfferText(text: string): boolean {
  return GROUP_OFFER_TEXT_RE.test(text.trim());
}

export function looksLikeTravelOfferText(text: string): boolean {
  return TRAVEL_OFFER_RE.test(text.trim());
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

/** Sinais de oferta do grupo / story. Imagem sozinha NÃO inicia (evita cardápio, bom dia, etc.). */
export function shouldStartGroupOfferFlow(ingress: GroupOfferIngress): boolean {
  if (ingress.referral?.source_type || ingress.referral?.headline) return true;

  const text = ingress.text.trim();
  const groupish = looksLikeGroupOfferText(text);
  const travelish = looksLikeTravelOfferText(text);

  if (groupish) return true;

  // Foto/cartaz: só se a leitura parecer pacote/viagem
  if (ingress.inboundKind === "image" && travelish) return true;

  if (ingress.quotedForwarded && (groupish || travelish || mentionsPaymentTerms(text))) {
    return true;
  }

  if (
    ingress.quotedWaMessageId &&
    (mentionsPaymentTerms(text) || groupish || (ingress.inboundKind === "image" && travelish))
  ) {
    return true;
  }

  if (
    mentionsPaymentTerms(text) &&
    text.length < 280 &&
    (ingress.quotedWaMessageId || groupish || (ingress.inboundKind === "image" && travelish))
  ) {
    return true;
  }

  return false;
}

/** Resumo curto para confirmação — sem despejar OCR/descrição inteira. */
export function shortOfferHint(raw: string): string {
  let t = raw.trim();
  // Preferir strip da legenda OCR (não engolir o conteúdo com [^)]*).
  t = t.replace(/^\(+Cliente enviou uma imagem:\s*/i, "").replace(/\)+\s*$/g, "");
  t = t.replace(/^\(+Cliente enviou[^)]*\)+\s*/i, "");
  t = t.replace(/Conteúdo da imagem:\s*/gi, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "essa promoção";
  const first = t.split(/(?<=[.!?])\s+/)[0] ?? t;
  const cut = first.slice(0, 90).trim();
  return cut.length < t.length && first.length > 90 ? `${cut}…` : cut;
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
  // Estilo WhatsApp: "Grupo · Foto" — a Meta quase nunca manda o destino da foto do grupo.
  if (quotedForwarded) {
    return "Foto";
  }
  return "Foto ou promoção citada";
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
  /** Pacote confirmado — seguir com briefing mastigado antes do humano. */
  startBriefing: boolean;
}

/** Contexto para answerTurismo após confirmar story/grupo/marcação. */
export function groupOfferBriefingPromptExtra(offer: GroupOfferData): string {
  const label =
    offer.offer_label?.trim() ||
    offer.cartaz_summary?.split("\n")[0]?.trim() ||
    offer.referral_headline?.trim() ||
    offer.quoted_text?.trim() ||
    "promoção confirmada";
  const hint = shortOfferHint(label);
  const lines = [
    `\n\n## PACOTE JÁ CONFIRMADO (story / grupo / marcação)`,
    `- O cliente confirmou o pacote/promoção: ${hint}.`,
    `- NÃO pergunte de novo qual pacote, destino da promoção ou se é “esse mesmo”.`,
    `- NÃO invente condição de pagamento (boleto/parcela); se perguntar, diga que o consultor confirma no pacote.`,
    `- Entre já no BRIEFING DE COTAÇÃO: uma pergunta concreta por mensagem (origem, datas/período, quem viaja…).`,
    `- Comece com uma frase curta de ok (ex.: “Fechado!”) e a primeira pergunta do que ainda falta.`,
    `- Quando origem + período + composição do grupo estiverem claros (ou a pessoa pedir valores/fechar), ofereça o consultor com [[OFERTA_HUMANO]].`,
  ];
  if (offer.payment_note) {
    lines.push(`- Cliente já falou de pagamento: ${offer.payment_note.slice(0, 160)} — anote e não invente resposta.`);
  }
  if (offer.cartaz_summary) {
    lines.push(`- Leitura do cartaz (só contexto): ${offer.cartaz_summary.slice(0, 200)}`);
  }
  return lines.join("\n");
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
  let startBriefing = false;
  let intakeState: string | null = GROUP_OFFER_INTAKE_STATE;

  const visualCandidate =
    offer.cartaz_summary?.split("\n")[0]?.trim() ||
    offer.quoted_text?.slice(0, 160) ||
    offer.referral_headline?.slice(0, 120);

  /** Pacote ok → briefing (não chama humano ainda). */
  const finalizeForBriefing = () => {
    offer.step = "done";
    offer.confirmed_at = offer.confirmed_at ?? new Date().toISOString();
    startBriefing = true;
    handoffHuman = false;
    notifyOwner = false;
    intakeState = null;
  };

  const labelHint = shortOfferHint(
    offer.offer_label || visualCandidate || "essa promoção",
  );

  if (offer.step === "confirm") {
    if (AFFIRMATIVE.test(userSaid)) {
      finalizeForBriefing();
    } else if (/^(n[aã]o|nao|n|outra|errad)/i.test(userSaid)) {
      offer.step = "ask_offer";
      offer.offer_label = undefined;
      replies.push(`Tranquilo! Qual pacote é então? Pode mandar o nome ou o cartaz de novo.`);
    } else {
      offer.offer_label = userSaid.slice(0, 300);
      replies.push(
        `Beleza — anotei *${shortOfferHint(userSaid)}*. É esse mesmo que você quer? Se for, me confirma que eu te ajudo a montar.`,
      );
    }
  } else if (offer.step === "done") {
    // Fluxo antigo / estado residual: se já confirmou, segue briefing no pipeline.
    if (offer.confirmed_at && !offer.alerted_at) {
      startBriefing = true;
      intakeState = null;
    } else {
      handoffHuman = true;
      intakeState = null;
      if (!offer.alerted_at && userSaid.length > 0) {
        notifyOwner = true;
        offer.alerted_at = new Date().toISOString();
        offer.payment_note = offer.payment_note ?? userSaid.slice(0, 300);
      }
    }
  } else {
    if (userTextLooksLikeOfferLabel(userSaid)) {
      offer.offer_label = userSaid.slice(0, 300);
      offer.step = "confirm";
      replies.push(
        `Entendi, *${shortOfferHint(userSaid)}*. É esse pacote que te interessou? Se sim, me confirma que eu já peço os detalhes pra montar.`,
      );
    } else if (visualCandidate) {
      offer.offer_label = visualCandidate.slice(0, 300);
      offer.step = "confirm";
      replies.push(
        `${name}vi o que você mandou — parece *${labelHint}*. É sobre essa promoção de viagem? Se for, me confirma que eu te ajudo a montar.`,
      );
    } else if (ingress.quotedWaMessageId || ingress.quotedForwarded) {
      if (mentionsPaymentTerms(userSaid)) {
        replies.push(
          `${name}vi que você veio da marcação/promoção do grupo. Boleto ou cartão o consultor confirma no pacote certo — me diz qual destino/promoção é essa (ou manda a foto de novo) que eu te ajudo.`,
        );
      } else {
        replies.push(
          `${name}vi que você citou a promoção do grupo. Qual pacote/destino é? Pode falar o nome ou mandar o cartaz de novo.`,
        );
      }
    } else if (offer.referral_headline || offer.source === "story") {
      replies.push(
        `${name}que bom que veio pelo story! Qual pacote te chamou atenção? Manda o nome ou o cartaz que eu te ajudo.`,
      );
    } else {
      replies.push(
        `${name}me conta qual pacote você quer — nome, valor ou o cartaz — que eu te ajudo a montar.`,
      );
    }

    if (
      mentionsPaymentTerms(userSaid) &&
      offer.offer_label &&
      offer.step === "confirm" &&
      !replies.length
    ) {
      finalizeForBriefing();
    }
  }

  const patchIntake: Record<string, unknown> = {
    ...input.intake,
    group_offer: offer,
  };
  if (startBriefing) {
    patchIntake["lead_stage"] = "qualificando";
    patchIntake["lead_updated_at"] = new Date().toISOString();
  }
  if (handoffHuman) {
    patchIntake["lead_stage"] = "quente";
    patchIntake["lead_updated_at"] = new Date().toISOString();
  }

  return { replies, patchIntake, intakeState, handoffHuman, notifyOwner, startBriefing };
}