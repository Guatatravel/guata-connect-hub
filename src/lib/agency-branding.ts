/** Nome comercial da agência em mensagens ao cliente. */
export const AGENCY_COMMERCIAL_NAME = "Guatá Viagens e Turismo";

/** Corrige "Guatá Viagens" sem "e Turismo" (modelo ou texto legado). */
export function normalizeAgencyNameInText(text: string): string {
  return text.replace(
    /\bGuat[aá]\s+Viagens\b(?!\s+e\s+Turismo)/gi,
    AGENCY_COMMERCIAL_NAME,
  );
}
