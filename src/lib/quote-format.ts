/**
 * Padrão oficial de cotação da agência (aéreo): 3 opções com e sem bagagem,
 * prazo para pagamento, aviso de alteração sem aviso prévio e carimbo de data/hora.
 * Módulo puro (navegador e servidor).
 */

export const QUOTE_DEFAULT_VALIDITY_MIN = 15;
export const QUOTE_MIN_VALIDITY = 5;
export const QUOTE_MAX_VALIDITY = 120;

export type FlightQuoteOption = {
  airline: string;
  flight?: string;
  departure?: string;
  arrival?: string;
  duration?: string;
  priceNoBag: string;
  priceWithBag?: string;
};

export type FlightQuoteInput = {
  route: string;
  date: string;
  passengers: number;
  options: FlightQuoteOption[];
  validityMinutes?: number;
  quotedAt?: Date;
};

export function clampValidity(minutes: number | undefined | null): number {
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n) || n <= 0) return QUOTE_DEFAULT_VALIDITY_MIN;
  return Math.min(QUOTE_MAX_VALIDITY, Math.max(QUOTE_MIN_VALIDITY, n));
}

/** "R$ 1.265,95" a partir de "1265.95", "1.265,95" ou "R$ 1265,95". */
export function formatBRL(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  let digits = s.replace(/[^\d.,]/g, "");
  if (digits.includes(",")) digits = digits.replace(/\./g, "").replace(",", ".");
  const n = Number(digits);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function quoteTimestamp(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function quoteWarningLines(validityMinutes?: number): string[] {
  const min = clampValidity(validityMinutes);
  return [
    `• Cotação válida por até ${min} minutos para pagamento e emissão.`,
    "• Valores sujeitos à disponibilidade e a alterações sem aviso prévio pelas companhias aéreas.",
  ];
}

export function formatFlightQuote(input: FlightQuoteInput): string {
  const options = input.options.filter((o) => o.airline.trim() && o.priceNoBag.trim()).slice(0, 3);
  const pax = Math.max(1, Math.round(input.passengers || 1));
  const lines: string[] = ["✈️ Cotação de Voos — Guatá", ""];
  if (input.route.trim()) lines.push(`Trecho: ${input.route.trim()}`);
  if (input.date.trim()) lines.push(`Data: ${input.date.trim()}`);
  lines.push("");
  options.forEach((o, i) => {
    const detail = [
      o.flight?.trim() ? `Voo ${o.flight.trim()}` : "",
      o.departure?.trim() && o.arrival?.trim() ? `${o.departure.trim()} ➔ ${o.arrival.trim()}` : "",
      o.duration?.trim() ?? "",
    ].filter(Boolean);
    lines.push(`Opção ${i + 1} (${[o.airline.trim(), ...detail].join(" | ")})`);
    lines.push(`• Sem bagagem despachada: ${formatBRL(o.priceNoBag)}`);
    if (o.priceWithBag?.trim()) lines.push(`• Com bagagem despachada: ${formatBRL(o.priceWithBag)}`);
    lines.push("");
  });
  lines.push(
    `👥 Valores para ${pax} passageiro${pax > 1 ? "s" : ""} (com taxas de embarque inclusas).`,
    "",
    "⚠️ IMPORTANTE:",
    ...quoteWarningLines(input.validityMinutes),
    "",
    `Cotação realizada em: ${quoteTimestamp(input.quotedAt ?? new Date())}.`,
    "",
    "Qual dessas opções fica melhor para você? Posso já reservar!",
  );
  return lines.join("\n");
}

/** Regras do padrão de cotação para o Guatá e o Copiloto. */
export function quotePromptRules(validityMinutes?: number): string {
  const min = clampValidity(validityMinutes);
  return (
    "\n## PADRÃO DE COTAÇÃO DA AGÊNCIA (quando houver valores reais)\n" +
    "- Valores de passagem/hotel só existem quando vêm do consultor ou do sistema de reservas. Nunca invente preço.\n" +
    "- Ao apresentar cotação aérea, mostre SEMPRE 3 opções (econômica, intermediária, melhor horário), cada uma com cia, voo, horários, duração e os valores sem bagagem e com bagagem despachada.\n" +
    "- Informe para quantos passageiros são os valores (com taxas inclusas).\n" +
    `- Termine com: \"Cotação válida por até ${min} minutos para pagamento e emissão\" e \"Valores sujeitos à disponibilidade e a alterações sem aviso prévio\".\n` +
    "- Inclua a data e a hora da cotação (Cotação realizada em: DD/MM/AAAA às HH:mm).\n"
  );
}
