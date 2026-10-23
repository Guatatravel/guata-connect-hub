/** Mensagens automáticas de link da base (preview Instagram/TikTok/YouTube no WhatsApp). */

export function formatKnowledgeLinkWhatsAppMessage(title: string, url: string): string {
  const u = url.trim();
  const place = title.trim();
  if (!place) {
    return `Olha, eu já conheci esse lugar! Vale a pena ver:\n${u}`;
  }
  return `Olha, eu já conheci ${place}! Vale a pena ver:\n${u}`;
}
