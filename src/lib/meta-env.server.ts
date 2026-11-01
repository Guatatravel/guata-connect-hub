/**
 * Leitura consistente dos secrets Meta (Lovable / env).
 * Evita envio com token antigo (_DESCUBRA) quando META_ACCESS_TOKEN foi renovado,
 * e permite um único Phone Number ID (_DESCUBRA) servir a linha viagens.
 */
import type { Line } from "@/lib/meta-send.server";

function trim(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

/** Token de envio: META_ACCESS_TOKEN (renovado no Lovable) vale para todas as linhas. */
export function metaAccessTokenForLine(line: Line): string | undefined {
  const generic = trim(process.env.META_ACCESS_TOKEN);
  if (generic) return generic;
  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  return trim(process.env[`META_ACCESS_TOKEN${suffix}`]);
}

/** Phone Number ID por linha, com fallback para setup de número único. */
export function metaPhoneNumberIdForLine(line: Line): string | undefined {
  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  const lineSpecific = trim(process.env[`META_PHONE_NUMBER_ID${suffix}`]);
  if (lineSpecific) return lineSpecific;
  const generic = trim(process.env.META_PHONE_NUMBER_ID);
  if (generic) return generic;
  if (line === "viagens") {
    return trim(process.env.META_PHONE_NUMBER_ID_DESCUBRA);
  }
  return undefined;
}

export function isMetaEnvConfiguredForLine(line: Line): boolean {
  return Boolean(metaAccessTokenForLine(line) && metaPhoneNumberIdForLine(line));
}
