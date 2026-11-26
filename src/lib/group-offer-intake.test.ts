import { describe, expect, test } from "bun:test";
import {
  asksToReadCartaz,
  buildOwnerGroupOfferAlert,
  cartazSummaryFromInbound,
  groupOfferBriefingPromptExtra,
  handleGroupOfferTurn,
  isMostlyPaymentQuestion,
  looksLikeGroupOfferText,
  looksLikeTravelOfferText,
  mentionsPaymentTerms,
  parseInboundImageText,
  quotePreviewWhenUnresolved,
  shortOfferHint,
  shouldStartGroupOfferFlow,
  templateReplyBlocksGroupOffer,
  userTextLooksLikeOfferLabel,
} from "@/lib/group-offer-intake.server";

describe("group-offer-intake", () => {
  test("detecta pagamento e grupo", () => {
    expect(mentionsPaymentTerms("dá para parcelar em 5x?")).toBe(true);
    expect(looksLikeGroupOfferText("vi no grupo")).toBe(true);
    expect(looksLikeGroupOfferText("promoção do restaurante")).toBe(false);
  });

  test("citação sozinha (ex. SIM ao convite) não inicia oferta do grupo", () => {
    expect(shouldStartGroupOfferFlow({ text: "Sim", quotedWaMessageId: "wamid.1" })).toBe(
      false,
    );
    expect(templateReplyBlocksGroupOffer(true, "accept", "Sim")).toBe(true);
    expect(templateReplyBlocksGroupOffer(true, null, "Sim")).toBe(true);
  });

  test("imagem sozinha ou cardápio não inicia; cartaz de viagem sim", () => {
    expect(
      shouldStartGroupOfferFlow({
        text: "(Cliente enviou uma imagem: cardápio do restaurante point do jhon)",
        inboundKind: "image",
      }),
    ).toBe(false);
    expect(
      shouldStartGroupOfferFlow({
        text: "PEÇA PELO NOSSO APLICATIVO E TENHA ACESSO A TODO O NOSSO CARDÁPIO",
        inboundKind: "image",
      }),
    ).toBe(false);
    expect(
      shouldStartGroupOfferFlow({
        text: "Pacote Nordeste 5 diárias resort",
        inboundKind: "image",
      }),
    ).toBe(true);
    expect(
      shouldStartGroupOfferFlow({
        text: "condições de pagamento?",
        quotedWaMessageId: "wamid.1",
      }),
    ).toBe(true);
  });

  test("travel vs group helpers", () => {
    expect(looksLikeTravelOfferText("hotel em Bonito")).toBe(true);
    expect(looksLikeTravelOfferText("prato executivo R$ 35")).toBe(false);
  });

  test("shortOfferHint corta descrição longa", () => {
    expect(shortOfferHint("(Cliente enviou uma imagem: Pacote Bonito 3 dias. Outro texto.)")).toContain(
      "Pacote",
    );
    expect(shortOfferHint("A".repeat(200)).length).toBeLessThanOrEqual(95);
  });

  test("preview de citação sem texto", () => {
    expect(quotePreviewWhenUnresolved(true)).toBe("Foto");
    expect(quotePreviewWhenUnresolved(false)).toContain("promoção");
  });

  test("dessa promoção inicia oferta do grupo", () => {
    expect(looksLikeGroupOfferText("Quero dessa promoção ai")).toBe(true);
    expect(
      shouldStartGroupOfferFlow({ text: "Quero dessa promoção ai" }),
    ).toBe(true);
  });

  test("alerta para o dono é curto e legível", () => {
    const t = buildOwnerGroupOfferAlert({
      phone: "5567999999999",
      sessionId: "00000000-0000-4000-8000-000000000001",
      lastUserText: "Sim",
      contactName: "Guilherme",
      offer: {
        step: "done",
        source: "cartaz",
        offer_label: "A imagem é um anúncio de pacote turístico para São Luís.",
        cartaz_summary:
          "A imagem é um anúncio de pacote turístico para São Luís. 2 adultos, 7 noites Rede Andrade, 02/04 a 09/04/2027.",
        payment_note: "Mais qual a forma de pagamento isso já li no cartaz",
        confirmed_at: new Date().toISOString(),
      },
    });
    expect(t).toContain("São Luís");
    expect(t).toContain("Guilherme");
    expect(t).toContain("forma de pagamento");
    expect(t).toContain("confirmou");
    expect(t).not.toContain("Cartaz (leitura)");
    expect(t.toLowerCase()).not.toContain("a imagem é um anúncio");
  });

  test("confirmar pacote inicia briefing, não handoff imediato", async () => {
    const turn = await handleGroupOfferTurn({
      sessionId: "00000000-0000-4000-8000-000000000001",
      firstName: "Ana",
      ingress: { text: "sim" },
      intake: {
        group_offer: {
          step: "confirm",
          source: "story",
          offer_label: "Pacote Nordeste 5 diárias",
        },
      },
      intakeState: "oferta_grupo",
    });
    expect(turn.startBriefing).toBe(true);
    expect(turn.handoffHuman).toBe(false);
    expect(turn.notifyOwner).toBe(false);
    expect(turn.patchIntake["lead_stage"]).toBe("qualificando");
    const offer = turn.patchIntake["group_offer"] as { step: string; confirmed_at?: string };
    expect(offer.step).toBe("done");
    expect(offer.confirmed_at).toBeTruthy();
  });

  test("briefing extra cita pacote confirmado", () => {
    const extra = groupOfferBriefingPromptExtra({
      step: "done",
      offer_label: "Bonito 3 dias",
      confirmed_at: new Date().toISOString(),
    });
    expect(extra).toContain("Bonito");
    expect(extra).toContain("[[OFERTA_HUMANO]]");
  });

  test("legenda de pagamento + OCR: prioriza cartaz", () => {
    const inbound =
      "Formas de pagamento de pacote\n\n(Conteúdo da imagem: Pacote Curitiba 09/02 a 16/02 Hotel Nacional Inn, aéreo Campo Grande)";
    expect(mentionsPaymentTerms("Formas de pagamento de pacote")).toBe(true);
    expect(isMostlyPaymentQuestion("Formas de pagamento de pacote")).toBe(true);
    expect(userTextLooksLikeOfferLabel("Formas de pagamento de pacote")).toBe(false);
    const parsed = parseInboundImageText(inbound);
    expect(parsed.caption).toContain("Formas de pagamento");
    expect(parsed.imageBody).toContain("Curitiba");
    expect(cartazSummaryFromInbound(inbound)).toContain("Curitiba");
    expect(shortOfferHint(inbound)).toContain("Curitiba");
  });

  test("leia o cartaz não é nome de pacote; reusa OCR", async () => {
    expect(asksToReadCartaz("Leia o cartaz")).toBe(true);
    expect(userTextLooksLikeOfferLabel("Leia o cartaz")).toBe(false);
    const turn = await handleGroupOfferTurn({
      sessionId: "00000000-0000-4000-8000-000000000001",
      firstName: "Guilherme",
      ingress: { text: "Leia o cartaz" },
      intake: {
        group_offer: {
          step: "confirm",
          source: "cartaz",
          offer_label: "Formas de pagamento de pacote",
          cartaz_summary: "Pacote Curitiba 09/02 a 16/02 Hotel Nacional Inn",
          payment_note: "Formas de pagamento de pacote",
        },
      },
      intakeState: "oferta_grupo",
    });
    expect(turn.startBriefing).toBe(false);
    expect(turn.replies.join(" ")).toContain("Curitiba");
    expect(turn.replies.join(" ").toLowerCase()).not.toContain("anotei *leia");
    const offer = turn.patchIntake["group_offer"] as { offer_label?: string };
    expect(offer.offer_label?.toLowerCase()).toContain("curitiba");
  });

  test("imagem com legenda de pagamento confirma destino do OCR", async () => {
    const inbound =
      "Formas de pagamento de pacote\n\n(Conteúdo da imagem: Pacote Curitiba 7 noites Hotel Nacional Inn aéreo Campo Grande)";
    const turn = await handleGroupOfferTurn({
      sessionId: "00000000-0000-4000-8000-000000000001",
      firstName: "Guilherme",
      ingress: { text: inbound, inboundKind: "image" },
      intake: {},
      intakeState: null,
    });
    expect(turn.replies.join(" ")).toContain("Curitiba");
    expect(turn.replies.join(" ").toLowerCase()).toContain("pagamento");
    const offer = turn.patchIntake["group_offer"] as {
      offer_label?: string;
      payment_note?: string;
      step: string;
    };
    expect(offer.step).toBe("confirm");
    expect(offer.offer_label?.toLowerCase()).toContain("curitiba");
    expect(offer.payment_note?.toLowerCase()).toContain("pagamento");
  });
});
