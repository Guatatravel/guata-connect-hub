/**
 * Cota de IA. O único teto publicado pela Lovable para o app no ar é de
 * 4 créditos por mês, da workspace inteira. Não existe um máximo de respostas.
 */

export const LOVABLE_INCLUDED_AI_CREDITS = 4;
export const AI_PERIOD_TIMEZONE = "America/Cuiaba";

/** Período que começa no dia 10 e vai até o dia 9 seguinte, no fuso de Cuiabá. */
export function aiPeriodKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_PERIOD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const startMonth = day >= 10 ? month : month === 1 ? 12 : month - 1;
  const startYear = day >= 10 ? year : month === 1 ? year - 1 : year;
  return `${startYear}-${String(startMonth).padStart(2, "0")}-10`;
}

export function aiPeriodResetsOn(periodKey: string): string {
  const [yearText, monthText] = periodKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-10`;
}
