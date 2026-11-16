/** Domínio público do painel (webhooks, OAuth). */
export const DEFAULT_PUBLIC_APP_ORIGIN = "https://guata-connect-hub.lovable.app";

export function resolvePublicAppOrigin(envValue?: string | null): string {
  const v = envValue?.trim();
  if (v) return v.replace(/\/$/, "");
  return DEFAULT_PUBLIC_APP_ORIGIN;
}

export function whatsappWebhookPath(): string {
  return "/api/public/webhooks/whatsapp";
}

export function whatsappWebhookUrl(origin = DEFAULT_PUBLIC_APP_ORIGIN): string {
  return `${resolvePublicAppOrigin(origin)}${whatsappWebhookPath()}`;
}