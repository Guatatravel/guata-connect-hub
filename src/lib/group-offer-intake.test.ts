import { describe, expect, test } from "bun:test";
import {
  buildOwnerGroupOfferAlert,
  looksLikeGroupOfferText,
  mentionsPaymentTerms,
  quotePreviewWhenUnresolved,
  shouldStartGroupOfferFlow,
} from "@/lib/group-offer-intake.server";

describe("group-offer-intake", () => {
  test("detecta pagamento e grupo", () => {
    expect(mentionsPaymentTerms("dá para parcelar em 5x?")).toBe(true);
    expect(looksLikeGroupOfferText("vi no grupo")).toBe(true);
  });

  test("shouldStart com citação ou cartaz", () => {
    expect(
      shouldStartGroupOfferFlow({ text: "oi", quotedWaMessageId: "wamid.1" }),
    ).toBe(true);
    expect(
      shouldStartGroupOfferFlow({ text: "Pacote Nordeste", inboundKind: "image" }),
    ).toBe(true);
  });

  test("preview de citação sem texto", () => {
    expect(quotePreviewWhenUnresolved(true)).toContain("grupo");
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
});