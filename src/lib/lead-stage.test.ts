import { describe, expect, test } from "bun:test";
import { detectLeadStage } from "@/lib/lead-stage.server";

describe("detectLeadStage", () => {
  test("curiosidade fica informacional", () => {
    expect(detectLeadStage("como é Bonito?", 3)).toBe("informacional");
    expect(detectLeadStage("me conta sobre o Pantanal", 2)).toBe("informacional");
    expect(detectLeadStage("tem praia em Natal?", 1)).toBe("informacional");
  });

  test("só citar viagem/hotel não sobe funil", () => {
    expect(detectLeadStage("viagem para Gramado", 2)).toBe("informacional");
    expect(detectLeadStage("hotel em Cancún", 1)).toBe("informacional");
  });

  test("pedido de orçamento/pacote qualifica", () => {
    expect(detectLeadStage("quero orçamento para 2 em julho", 1)).toBe("quente");
    expect(detectLeadStage("quanto custa um pacote pra Bonito?", 1)).toBe("qualificando");
    expect(detectLeadStage("quero montar uma viagem", 1)).toBe("qualificando");
  });

  test("reservar é quente", () => {
    expect(detectLeadStage("quero reservar", 1)).toBe("quente");
    expect(detectLeadStage("falar com um consultor", 1)).toBe("quente");
  });
});
