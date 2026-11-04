/** Dados do Passhub compartilhados entre navegador e servidor (sem segredos). */

export const PASSHUB_REFERRAL_URL =
  "https://passhub.com.br/?ref=PH-10A6A0&utm_source=indicacao&utm_medium=afiliado&utm_campaign=PH-10A6A0";

/** Cada produto do Passhub tem a sua própria chave de API. */
export const PASSHUB_PRODUCTS = ["aereo", "hotel", "seguro", "rodoviario"] as const;
export type PasshubProduct = (typeof PASSHUB_PRODUCTS)[number];

export const PASSHUB_PRODUCT_LABEL: Record<PasshubProduct, string> = {
  aereo: "Passagens aéreas",
  hotel: "Hospedagem",
  seguro: "Seguro viagem",
  rodoviario: "Passagens de ônibus",
};

export type PasshubProductView = {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string | null;
};

export type PasshubSettingsView = {
  enabled: boolean;
  products: Record<PasshubProduct, PasshubProductView>;
  autoSearch: boolean;
  autoPayment: boolean;
  quoteValidityMinutes: number;
  agencyContactEmail: string;
  agencyContactPhone: string;
  canEdit: boolean;
};

export function maskKey(key: string | null | undefined): string | null {
  const k = (key ?? "").trim();
  if (!k) return null;
  return k.length > 4 ? `••••${k.slice(-4)}` : "••••";
}
