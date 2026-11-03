/** Dados do Passhub compartilhados entre navegador e servidor (sem segredos). */

export const PASSHUB_REFERRAL_URL =
  "https://passhub.com.br/?ref=PH-10A6A0&utm_source=indicacao&utm_medium=afiliado&utm_campaign=PH-10A6A0";

export type PasshubSettingsView = {
  enabled: boolean;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  modAereo: boolean;
  modHotel: boolean;
  modSeguro: boolean;
  modRodoviario: boolean;
  autoSearch: boolean;
  autoPayment: boolean;
  quoteValidityMinutes: number;
  canEdit: boolean;
};
