import { describe, expect, test } from "bun:test";
import {
  buildOwnerGroupOfferAlert,
  groupOfferBriefingPromptExtra,
  handleGroupOfferTurn,
  looksLikeGroupOfferText,
  looksLikeTravelOfferText,
  mentionsPaymentTerms,
  quotePreviewWhenUnresolved,
  shortOfferHint,
  shouldStartGroupOfferFlow,
  templateReplyBlocksGroupOffer,
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

  test("alerta para o dono inclui oferta", () => {
    const t = buildOwnerGroupOfferAlert({
      phone: "5567999999999",
      sessionId: "00000000-0000-4000-8000-000000000001",
      lastUserText: "quero",
      offer: {
        step: "done",
        source: "cartaz",
        offer_label: "Promo B",
        payment_note: "boleto",
      },
    });
    expect(t).toContain("Promo B");
    expect(t).toContain("boleto");
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
});
