/** Labels de linha WhatsApp no painel (por tipo de org). */
export type OrgLineUi = {
  isGuataOrg: boolean;
  useDescubraKb: boolean;
  hasViagensChannel: boolean;
};

export function lineFilterOptions(org: OrgLineUi) {
  if (!org.isGuataOrg) return [] as Array<{ value: string; label: string }>;
  const opts: Array<{ value: string; label: string }> = [
    { value: "descubra_ms", label: "Canal turismo (Descubra)" },
  ];
  if (org.hasViagensChannel) {
    opts.push({ value: "guata_viagens", label: "Canal comercial (Viagens)" });
  }
  return opts;
}

export function attendantLineOptions(org: OrgLineUi) {
  if (!org.isGuataOrg) {
    return [{ value: "descubra" as const, label: "WhatsApp comercial" }];
  }
  const opts: Array<{ value: "descubra" | "viagens"; label: string }> = [
    { value: "descubra", label: "Canal turismo (Descubra)" },
  ];
  if (org.hasViagensChannel) {
    opts.push({ value: "viagens", label: "Canal comercial (Viagens)" });
  }
  return opts;
}

export function lineBadgeLabel(
  line: "descubra_ms" | "guata_viagens",
  org: OrgLineUi,
): string {
  if (!org.isGuataOrg) return "WhatsApp";
  if (line === "guata_viagens") return "Viagens";
  return org.hasViagensChannel ? "Descubra" : "Guatá";
}
