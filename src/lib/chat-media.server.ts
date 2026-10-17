/**
 * Mídia de conversas WhatsApp (inbound/outbound) — Storage + URLs assinadas.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const CHAT_MEDIA_BUCKET = "chat-media";

export type ChatMediaKind = "image" | "audio" | "video" | "document";

function extFromMime(mime: string): string {
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "audio/ogg") return "ogg";
  if (m === "audio/mpeg") return "mp3";
  if (m === "audio/mp4") return "m4a";
  if (m === "application/pdf") return "pdf";
  return "bin";
}

export async function storeChatMedia(
  phone: string,
  bytes: Uint8Array,
  mimeType: string,
  kind: ChatMediaKind,
): Promise<string> {
  const safePhone = phone.replace(/\D/g, "") || "unknown";
  const path = `${safePhone}/${Date.now()}-${kind}.${extFromMime(mimeType)}`;
  const { error } = await supabaseAdmin.storage.from(CHAT_MEDIA_BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function storeChatMediaFromBase64(
  phone: string,
  base64: string,
  mimeType: string,
  kind: ChatMediaKind,
): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Arquivo maior que 8 MB");
  return storeChatMedia(phone, bytes, mimeType, kind);
}

/** URL para o painel (staff) ou para a Meta baixar (envio). */
export async function signedChatMediaUrl(
  path: string,
  expiresSec = 60 * 60 * 24,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(path, expiresSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function mediaKindFromMime(mime: string): ChatMediaKind {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "document";
}
