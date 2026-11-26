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
  /\b(parcela|parcelamento|boleto|cart[aã]o|pix|entrada|sinal|financi|cr[eé]dito|vezes|\d\s*x|em\s*\d+\s*vezes|condi[cç][aãõ]e?s?\s+de\s+pagamento|formas?\s+de\s+pagamento|pagamento\s+(do\s+|de\s+)?pacote|como\s+(se\s+)?paga|aceita\s+boleto)\b/i;

/** Cliente pediu para ler a foto/cartaz — não é nome de pacote. */
const READ_CARTAZ_RE =
  /\b((me\s+)?(leia|l[eê]|ler|olha|abre)\s+(o\s+|a\s+)?(cartaz|foto|imagem|panfleto|flyer)|leia\s+a[ií]|l[eê]\s+a[ií])\b/i;

/** Citou grupo/story/cartaz / “dessa promoção” (marcação). */
const GROUP_OFFER_TEXT_RE =
  /\b(vi\s+no\s+grupo|vi\s+o\s+story|vi\s+seu\s+story|oferta\s+do\s+grupo|pacote\s+do\s+grupo|no\s+grupo|pelo\s+story|stories|story|cartaz|condi[cç][aã]o\s+especial|dessa\s+promo([cç][aã]o)?|dessa\s+oferta|desse\s+pacote|quero\s+(essa|desse|dessa)\s+(promo|promo([cç][aã]o)|oferta|pacote)|marcação|marcacao)\b/i;

/** Parece pacote/viagem (cartaz de turismo), não restaurante ou meme. */
const TRAVEL_OFFER_RE =
  /\b(pacote|viagem|turismo|destino|hotel|resort|cruzeiro|passeio|excurs[aã]o|roteiro|all[\s-]?inclusive|di[aá]rias?|hospedagem|a[eé]reo|passagem|transfer|bonito|pantanal|gramado|nordeste|ms\b|mato\s+grosso)\b/i;

export function mentionsPaymentTerms(text: string): boolean {
  return PAYMENT_RE.test(text.trim());
}

export function asksToReadCartaz(text: string): boolean {
  return READ_CARTAZ_RE.test(text.trim());
}

/** Legenda curta de pagamento (ex.: "formas de pagamento"), não título do pacote. */
export function isMostlyPaymentQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || !mentionsPaymentTerms(t)) return false;
  const words = t.split(/\s+/).length;
  if (words <= 12 && !/\b\d{1,2}\/\d{1,2}\b/.test(t)) return true;
  if (!looksLikeTravelOfferText(t) && words <= 20) return true;
  return false;
}

export function looksLikeGroupOfferText(text: string): boolean {
  return GROUP_OFFER_TEXT_RE.test(text.trim());
}

export function looksLikeTravelOfferText(text: string): boolean {
  return TRAVEL_OFFER_RE.test(text.trim());
}

/**
 * Separa legenda WhatsApp do OCR/descrição da imagem.
 * Cliente costuma mandar: foto do cartaz + legenda com a dúvida.
 */
export function parseInboundImageText(text: string): { caption?: string; imageBody?: string } {
  const t = text.trim();
  if (!t) return {};

  const conteudo = t.match(/\(Conteúdo da imagem:\s*([\s\S]+?)\)\s*$/i);
  if (conteudo && conteudo.index !== undefined) {
    const before = t.slice(0, conteudo.index).trim();
    return {
      caption: before || undefined,
      imageBody: conteudo[1]!.trim() || undefined,
    };
  }

  const onlyCliente = t.match(/^\(+Cliente enviou uma imagem:\s*([\s\S]+?)\)+\s*$/i);
  if (onlyCliente) {
    return { imageBody: onlyCliente[1]!.trim() || undefined };
  }

  const capThenCliente = t.match(
    /^([\s\S]+?)\n\n\(Cliente enviou uma imagem:\s*([\s\S]+?)\)\s*$/i,
  );
  if (capThenCliente) {
    return {
      caption: capThenCliente[1]!.trim() || undefined,
      imageBody: capThenCliente[2]!.trim() || undefined,
    };
  }

  return { caption: t };
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
  const parsed = parseInboundImageText(raw);
  let t = (parsed.imageBody || parsed.caption || raw).trim();
  // Preferir strip da legenda OCR (não engolir o conteúdo com [^)]*).
  t = t.replace(/^\(+Cliente enviou uma imagem:\s*/i, "").replace(/\)+\s*$/g, "");
  t = t.replace(/^\(+Cliente enviou[^)]*\)+\s*/i, "");
  t = t.replace(/Conteúdo da imagem:\s*/gi, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "essa promoção";
  // Não usar legenda de pagamento como hint do pacote.
  if (parsed.imageBody && parsed.caption && isMostlyPaymentQuestion(parsed.caption)) {
    t = parsed.imageBody.replace(/\s+/g, " ").trim();
  }
  const first = t.split(/(?<=[.!?])\s+/)[0] ?? t;
  const cut = first.slice(0, 90).trim();
  return cut.length < t.length && first.length > 90 ? `${cut}…` : cut;
}

/** Prefere o OCR da imagem; legenda de pagamento não vira resumo do cartaz. */
export function cartazSummaryFromInbound(text: string): string | undefined {
  const { imageBody, caption } = parseInboundImageText(text);
  if (imageBody && imageBody.length >= 8) return imageBody.slice(0, 500);
  if (caption && caption.length >= 8) {
    if (isMostlyPaymentQuestion(caption)) return undefined;
    if (looksLikeTravelOfferText(caption)) return caption.slice(0, 500);
  }
  return undefined;
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

export function userTextLooksLikeOfferLabel(text: string): boolean {
  const t = text.trim();
  if (t.length < 4 || t.length > 400) return false;
  if (/^(sim|n[aã]o|nao|ok|oi|ol[aá])\b/i.test(t)) return false;
  if (asksToReadCartaz(t)) return false;
  if (isMostlyPaymentQuestion(t)) return false;
  if (mentionsPaymentTerms(t) && t.split(/\s+/).length < 10) return false;
  // Texto misturado legenda+OCR: usa só o corpo da imagem para julgar rótulo
  const { imageBody, caption } = parseInboundImageText(t);
  const probe = (imageBody || caption || t).trim();
  if (isMostlyPaymentQuestion(probe)) return false;
  return (
    /\b(pacote|viagem|destino|hotel|resort|[rR]\$\s*\d|oferta|[abc]\b)\b/.test(probe) ||
    /\d{3,}/.test(probe)
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
  const parsedInbound = parseInboundImageText(userSaid);
  const paymentSnippet =
    (parsedInbound.caption && mentionsPaymentTerms(parsedInbound.caption)
      ? parsedInbound.caption
      : mentionsPaymentTerms(userSaid) && !parsedInbound.imageBody
        ? userSaid
        : parsedInbound.caption && isMostlyPaymentQuestion(parsedInbound.caption)
          ? parsedInbound.caption
          : undefined) ??
    (mentionsPaymentTerms(userSaid) && isMostlyPaymentQuestion(userSaid) ? userSaid : undefined);

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
  if (paymentSnippet) {
    offer.payment_note = paymentSnippet.slice(0, 300);
  } else if (mentionsPaymentTerms(userSaid) && !asksToReadCartaz(userSaid)) {
    const note = parsedInbound.caption || userSaid;
    if (isMostlyPaymentQuestion(note) || note.split(/\s+/).length < 16) {
      offer.payment_note = note.slice(0, 300);
    }
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

  const pushConfirmFromCartaz = (hintSource: string, paymentAck: boolean) => {
    const hint = shortOfferHint(hintSource);
    offer.offer_label = hintSource.slice(0, 300);
    offer.step = "confirm";
    if (paymentAck) {
      replies.push(
        `${name}vi o cartaz — parece *${hint}*. Anotei sua dúvida de pagamento (o consultor confirma boleto/parcela no pacote). É essa promoção? Se for, me confirma que eu te ajudo a montar.`,
      );
    } else {
      replies.push(
        `${name}vi o que você mandou — parece *${hint}*. É sobre essa promoção de viagem? Se for, me confirma que eu te ajudo a montar.`,
      );
    }
  };

  if (offer.step === "confirm") {
    if (AFFIRMATIVE.test(userSaid)) {
      finalizeForBriefing();
    } else if (/^(n[aã]o|nao|n|outra|errad)/i.test(userSaid)) {
      offer.step = "ask_offer";
      offer.offer_label = undefined;
      replies.push(`Tranquilo! Qual pacote é então? Pode mandar o nome ou o cartaz de novo.`);
    } else if (asksToReadCartaz(userSaid)) {
      const fromCartaz = offer.cartaz_summary?.trim();
      if (fromCartaz) {
        pushConfirmFromCartaz(fromCartaz, Boolean(offer.payment_note));
      } else {
        replies.push(
          `${name}manda o cartaz de novo (foto) que eu leio e te confirmo o pacote.`,
        );
      }
    } else if (
      mentionsPaymentTerms(userSaid) &&
      !userTextLooksLikeOfferLabel(userSaid)
    ) {
      const hint = shortOfferHint(
        offer.offer_label || visualCandidate || "essa promoção",
      );
      replies.push(
        `Anotei a dúvida de pagamento. Sobre *${hint}* — é esse pacote? Me confirma que eu te ajudo (condição o consultor confirma).`,
      );
    } else if (userTextLooksLikeOfferLabel(userSaid)) {
      const labelSource = parseInboundImageText(userSaid).imageBody || userSaid;
      offer.offer_label = labelSource.slice(0, 300);
      replies.push(
        `Beleza — anotei *${shortOfferHint(labelSource)}*. É esse mesmo que você quer? Se for, me confirma que eu te ajudo a montar.`,
      );
    } else if (ingress.inboundKind === "image" && visualCandidate) {
      pushConfirmFromCartaz(visualCandidate, Boolean(paymentSnippet || offer.payment_note));
    } else {
      const hint = shortOfferHint(
        offer.offer_label || visualCandidate || "essa promoção",
      );
      replies.push(
        `Só pra confirmar: é *${hint}*? Responde sim ou manda o nome/cartaz certo.`,
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
    if (asksToReadCartaz(userSaid) && offer.cartaz_summary) {
      pushConfirmFromCartaz(offer.cartaz_summary, Boolean(offer.payment_note));
    } else if (visualCandidate) {
      // Foto/cartaz: prioriza OCR; legenda de pagamento só anota.
      pushConfirmFromCartaz(visualCandidate, Boolean(paymentSnippet || offer.payment_note));
    } else if (userTextLooksLikeOfferLabel(userSaid)) {
      const labelSource = parseInboundImageText(userSaid).imageBody || userSaid;
      offer.offer_label = labelSource.slice(0, 300);
      offer.step = "confirm";
      replies.push(
        `Entendi, *${shortOfferHint(labelSource)}*. É esse pacote que te interessou? Se sim, me confirma que eu já peço os detalhes pra montar.`,
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
    } else if (isMostlyPaymentQuestion(userSaid)) {
      replies.push(
        `${name}anotei a dúvida de pagamento. Me manda o cartaz ou o nome do pacote que eu te ajudo — boleto/parcela o consultor confirma.`,
      );
    } else {
      replies.push(
        `${name}me conta qual pacote você quer — nome, valor ou o cartaz — que eu te ajudo a montar.`,
      );
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