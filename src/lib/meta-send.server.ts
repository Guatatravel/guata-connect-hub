/**
 * Envio de mensagens via Meta WhatsApp Cloud API — server-only.
 * Suporta 2 linhas via sufixos _DESCUBRA / _VIAGENS.
 * Retorna { ok:false, reason:'not_configured' } quando os secrets faltam.
 */

import { resolveWhatsAppCredentials } from "@/lib/organizations.server";

export type Line = "descubra" | "viagens";

async function lineCreds(line: Line) {
  return resolveWhatsAppCredentials(line);
}

export interface SendResult {
  ok: boolean;
  reason?: string;
  messageId?: string;
}

export async function sendWhatsAppText(
  line: Line,
  to: string,
  text: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(line);
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
        type: "text",
        text: { body: text.slice(0, 4000) },
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

export async function sendWhatsAppDocument(
  line: Line,
  to: string,
  documentUrl: string,
  filename = "documento.pdf",
  caption?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(line);
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

export async function sendWhatsAppImage(
  line: Line,
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<SendResult> {
  const { token, phoneId } = await lineCreds(line);
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

/**
 * Marca a mensagem recebida como lida (tique azul) e mostra
 * "digitando..." no WhatsApp do cliente (até 25s ou até a resposta chegar).
 */
export async function markReadAndTyping(line: Line, messageId: string): Promise<void> {
  const { token, phoneId } = await lineCreds(line);
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

/** Atraso humanizado: ~2s a 4s, proporcional ao tamanho da resposta. */
export function typingDelayMs(text: string): number {
  return Math.round(Math.min(4000, 2000 + text.length * 8));
}

export async function isMetaConfigured(line: Line = "descubra"): Promise<boolean> {
  const { token, phoneId } = await lineCreds(line);
  return Boolean(token && phoneId);
}