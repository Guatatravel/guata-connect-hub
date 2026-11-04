import { describe, expect, it } from "bun:test";
import { reservationDataRequest, reservationPromptRules } from "./reservation-rules";

describe("dados para reserva", () => {
  it("pede nome completo igual ao documento, CPF e data de nascimento", () => {
    const msg = reservationDataRequest();
    expect(msg).toContain("Nome completo igual consta no documento com foto");
    expect(msg).toContain("CPF:");
    expect(msg).toContain("Data de nascimento:");
  });

  it("não pede e-mail nem telefone do cliente", () => {
    const msg = reservationDataRequest(2).toLowerCase();
    expect(msg).not.toContain("e-mail");
    expect(msg).not.toContain("email");
    expect(msg).not.toContain("telefone");
  });

  it("com vários passageiros pede os dados de cada um", () => {
    expect(reservationDataRequest(3)).toContain("cada um dos 3 passageiros");
  });

  it("regra do bot manda usar os contatos da agência na emissão", () => {
    const rules = reservationPromptRules("Guatá");
    expect(rules).toContain("NÃO peça e-mail nem telefone do cliente");
    expect(rules).toContain("contatos da Guatá");
  });
});
