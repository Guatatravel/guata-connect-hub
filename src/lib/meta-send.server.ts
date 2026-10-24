/**
 * Envio de mensagens via Meta WhatsApp Cloud API — server-only.
 * Credenciais por organização + linha (banco ou env Guatá).
 */
import {
  getGuataOrganizationId,
  resolveWhatsAppCredentials,
} from "@/lib/organizations.server";

export type Line = "descubra" | "viagens";

export interface WhatsAppTarget {
  organizationId: string;
  line: Line;
}

async function lineCreds(target: WhatsAppTarget) {
  return resolveWhatsAppCredentials(target.organizationId, target.line);
}

export interface SendResult {
  ok: boolean;
  reason?: string;
  messageId?: string;
}

/** Citação do WhatsApp (responder uma mensagem específica). */
function waPayload(
  to: string,
  type: string,
  content: object,
  replyToWaId?: string,
): string {
  const body: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""),
    type,
    [type]: content,
  };
  const quoted = replyToWaId?.trim();
  if (quoted) body.context = { message_id: quoted };
  return JSON.stringify(body);
}

export async function sendWhatsAppText(
  target: WhatsAppTarget,
  to: string,
  text: string,
  options?: { previewUrl?: boolean; replyToWaId?: string },
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const body = text.slice(0, 4000);
  const previewUrl =
    options?.previewUrl ?? /https?:\/\/\S+/i.test(body);
  const textPayload: { body: string; preview_url?: boolean } = { body };
  if (previewUrl) textPayload.preview_url = true;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: waPayload(to, "text", textPayload, options?.replyToWaId),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function sendWhatsAppDocument(
  target: WhatsAppTarget,
  to: string,
  documentUrl: string,
  filename = "documento.pdf",
  caption?: string,
  replyToWaId?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const document: { link: string; filename: string; caption?: string } = {
    link: documentUrl,
    filename: filename.slice(0, 240),
  };
  if (caption?.trim()) document.caption = caption.trim().slice(0, 1024);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: waPayload(to, "document", document, replyToWaId),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function sendWhatsAppDocumentByMediaId(
  target: WhatsAppTarget,
  to: string,
  mediaId: string,
  filename = "documento.pdf",
  caption?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const document: { id: string; filename: string; caption?: string } = {
    id: mediaId,
    filename: filename.slice(0, 240),
  };
  if (caption?.trim()) document.caption = caption.trim().slice(0, 1024);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "document",
        document,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

/** PDF/documento via upload na Meta (mais confiável que link externo). */
export async function sendWhatsAppDocumentBytes(
  target: WhatsAppTarget,
  to: string,
  bytes: Uint8Array,
  filename: string,
  caption?: string,
  mimeType = "application/pdf",
): Promise<SendResult> {
  const uploaded = await uploadWhatsAppMedia(target, bytes, mimeType, filename);
  if (!uploaded.ok) return { ok: false, reason: uploaded.reason };
  return sendWhatsAppDocumentByMediaId(target, to, uploaded.mediaId, filename, caption);
}

export async function sendWhatsAppImageByMediaId(
  target: WhatsAppTarget,
  to: string,
  mediaId: string,
  caption?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const image: { id: string; caption?: string } = { id: mediaId };
  if (caption?.trim()) image.caption = caption.trim().slice(0, 1024);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "image",
        image,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function sendWhatsAppImageBytes(
  target: WhatsAppTarget,
  to: string,
  bytes: Uint8Array,
  filename: string,
  caption?: string,
  mimeType = "image/jpeg",
): Promise<SendResult> {
  const uploaded = await uploadWhatsAppMedia(target, bytes, mimeType, filename);
  if (!uploaded.ok) return { ok: false, reason: uploaded.reason };
  return sendWhatsAppImageByMediaId(target, to, uploaded.mediaId, caption);
}

export async function sendWhatsAppImage(
  target: WhatsAppTarget,
  to: string,
  imageUrl: string,
  caption?: string,
  replyToWaId?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const image: { link: string; caption?: string } = { link: imageUrl };
  if (caption?.trim()) image.caption = caption.trim().slice(0, 1024);

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: waPayload(to, "image", image, replyToWaId),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function uploadWhatsAppMedia(
  target: WhatsAppTarget,
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
): Promise<{ ok: true; mediaId: string } | { ok: false; reason: string }> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", mimeType);
  const slice = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  form.set("file", new Blob([slice], { type: mimeType }), filename);

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_upload_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) return { ok: false, reason: "meta_upload_no_id" };
  return { ok: true, mediaId: json.id };
}

export async function sendWhatsAppAudioByMediaId(
  target: WhatsAppTarget,
  to: string,
  mediaId: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "audio",
        audio: { id: mediaId },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

/** TTS → upload na Meta + envio por media id (mais confiável que link externo). */
export async function sendWhatsAppAudioBytes(
  target: WhatsAppTarget,
  to: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<SendResult> {
  const ext = mimeType.includes("mpeg")
    ? "mp3"
    : mimeType.includes("ogg")
      ? "ogg"
      : mimeType.includes("mp4")
        ? "m4a"
        : mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("aac")
            ? "aac"
            : "bin";
  const uploaded = await uploadWhatsAppMedia(
    target,
    bytes,
    mimeType,
    `guata-reply.${ext}`,
  );
  if (!uploaded.ok) return { ok: false, reason: uploaded.reason };
  return sendWhatsAppAudioByMediaId(target, to, uploaded.mediaId);
}

/** Template aprovado na Meta. Único tipo que sai fora da janela de 24h. */
export async function sendWhatsAppTemplate(
  target: WhatsAppTarget,
  to: string,
  template: {
    name: string;
    language?: string;
    bodyParams?: string[];
    replyToWaId?: string;
  },
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const payload: {
    name: string;
    language: { code: string };
    components?: Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
  } = {
    name: template.name.trim(),
    language: { code: (template.language || "pt_BR").trim() || "pt_BR" },
  };
  const params = (template.bodyParams ?? [])
    .map((text) => text.trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((text) => ({ type: "text", text: text.slice(0, 1024) }));
  if (params.length > 0) {
    payload.components = [{ type: "body", parameters: params }];
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: waPayload(to, "template", payload, template.replyToWaId),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 300)}` };
  }
  const json = (await res.json()) as { messages?: Array<{ id?: string }> };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function sendWhatsAppAudio(
  target: WhatsAppTarget,
  to: string,
  audioUrl: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId) {
    return { ok: false, reason: "not_configured" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""),
        type: "audio",
        audio: { link: audioUrl },
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    return { ok: false, reason: `meta_${res.status}: ${err.slice(0, 200)}` };
  }
  const json = (await res.json()) as {
    messages?: Array<{ id?: string }>;
  };
  return { ok: true, messageId: json.messages?.[0]?.id };
}

export async function markReadAndTyping(
  target: WhatsAppTarget,
  messageId: string,
): Promise<void> {
  const { token, phoneId } = await lineCreds(target);
  if (!token || !phoneId || !messageId) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[meta] read/typing falhou:", res.status, await res.text().catch(() => ""));
}

export function typingDelayMs(text: string): number {
  return Math.round(Math.min(4000, 2000 + text.length * 8));
}

export async function isMetaConfigured(
  organizationId: string,
  line: Line = "descubra",
): Promise<boolean> {
  const { token, phoneId } = await resolveWhatsAppCredentials(organizationId, line);
  return Boolean(token && phoneId);
}

/** Campanhas e diagnósticos legados da org Guatá. */
export async function isGuataMetaConfigured(line: Line = "descubra"): Promise<boolean> {
  const orgId = await getGuataOrganizationId();
  return isMetaConfigured(orgId, line);
}
