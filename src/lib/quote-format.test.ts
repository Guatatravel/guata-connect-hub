import { describe, expect, it } from "bun:test";
import { clampValidity, formatFlightQuote, quoteWarningLines } from "./quote-format";

const opt = (airline: string, noBag: string, withBag: string) => ({
  airline,
  priceNoBag: noBag,
  priceWithBag: withBag,
});

describe("padrão de cotação da agência", () => {
  it("mostra no máximo 3 opções", () => {
    const text = formatFlightQuote({
      route: "STM ➔ BEL",
      date: "10/11",
      passengers: 1,
      options: [opt("Gol", "1265,95", "1365,06"), opt("Azul", "1347,29", "1446,40"), opt("Latam", "2279,01", "2424,82"), opt("Extra", "1", "2")],
    });
    expect(text).toContain("Opção 3 (Latam)");
    expect(text).not.toContain("Opção 4");
  });

  it("mostra valor sem e com bagagem", () => {
    const text = formatFlightQuote({ route: "", date: "", passengers: 1, options: [opt("Gol", "1265,95", "1365,06")] });
    expect(text).toContain("Sem bagagem despachada: R$ 1.265,95");
    expect(text).toContain("Com bagagem despachada: R$ 1.365,06");
  });

  it("usa 15 minutos de validade por padrão", () => {
    expect(quoteWarningLines()[0]).toContain("até 15 minutos");
  });

  it("respeita o prazo configurado (ex.: 30 minutos)", () => {
    expect(quoteWarningLines(30)[0]).toContain("até 30 minutos");
  });

  it("limita o prazo entre 5 e 120 minutos", () => {
    expect(clampValidity(1)).toBe(5);
    expect(clampValidity(500)).toBe(120);
  });

  it("avisa que o valor pode mudar sem aviso prévio", () => {
    const text = formatFlightQuote({ route: "", date: "", passengers: 2, options: [opt("Gol", "100", "")] });
    expect(text).toContain("alterações sem aviso prévio");
    expect(text).toContain("Valores para 2 passageiros");
  });

  it("carimba data e hora da cotação", () => {
    const text = formatFlightQuote({
      route: "",
      date: "",
      passengers: 1,
      options: [opt("Gol", "100", "")],
      quotedAt: new Date(2026, 9, 30, 18, 46),
    });
    expect(text).toContain("Cotação realizada em: 30/10/2026 às 18:46.");
  });
});
