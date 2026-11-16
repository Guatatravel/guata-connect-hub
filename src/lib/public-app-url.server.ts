import {
  resolvePublicAppOrigin,
  whatsappWebhookPath,
  whatsappWebhookUrl,
} from "@/lib/public-app-url.shared";

export function serverPublicAppOrigin(): string {
  return resolvePublicAppOrigin(
    process.env.GUATA_PUBLIC_APP_URL ?? process.env.PUBLIC_APP_URL ?? null,
  );
}

export function serverWhatsAppWebhookUrl(): string {
  return whatsappWebhookUrl(serverPublicAppOrigin());
}

export { whatsappWebhookPath };