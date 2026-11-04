/**
 * Regra de fechamento/reserva da agência (módulo puro).
 * Do passageiro pedimos só documento; contatos da emissão são sempre os da agência.
 */

export const RESERVATION_PASSENGER_FIELDS = [
  "Nome completo igual consta no documento com foto que vai utilizar para embarcar",
  "CPF",
  "Data de nascimento",
] as const;

/** Mensagem padrão para pedir os dados da reserva ao cliente. */
export function reservationDataRequest(passengers = 1): string {
  const intro =
    passengers > 1
      ? `Para fazer as reservas vou precisar destas informações de cada um dos ${passengers} passageiros:`
      : "Para fazer as reservas vou precisar destas informações:";
  return [intro, "", ...RESERVATION_PASSENGER_FIELDS.map((f) => `${f}:`)].join("\n");
}

export function reservationPromptRules(agencyName: string): string {
  return (
    "\n## FECHAMENTO E DADOS PARA RESERVA\n" +
    "- Quando o cliente escolher uma opção e quiser fechar, peça SOMENTE, de cada passageiro: " +
    RESERVATION_PASSENGER_FIELDS.join("; ") +
    ".\n" +
    "- NÃO peça e-mail nem telefone do cliente para a emissão: a reserva sai com os contatos da " +
    `${agencyName}, para a agência receber avisos de alteração/cancelamento e avisar o cliente.\n` +
    "- Nunca peça número de cartão ou senha no chat. Pagamento é por link oficial enviado pela agência.\n" +
    "- Não prometa voucher antes do pagamento e da emissão. Depois de emitido, o consultor envia o voucher (comprovante) aqui pelo WhatsApp.\n"
  );
}
