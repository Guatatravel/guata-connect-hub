/**
 * Normaliza mensagens do webhook WhatsApp (texto, imagem, áudio) para o pipeline.
 */
import type { Line } from "@/lib/meta-send.server";
import { downloadWhatsAppMedia } from "@/lib/meta-media.server";
import {
  describeWhatsAppImage,
  transcribeWhatsAppAudio,
} from "@/lib/media-understanding.server";
import { storeChatMedia, type ChatMediaKind } from "@/lib/chat-media.server";

export interface InboundAttachment {
  storagePath: string;
  mimeType: string;
  mediaKind: ChatMediaKind;
  filename?: string;
}

export interface NormalizedInbound {
  /** Texto usado pela IA e gravado no histórico */
  text: string;
  inboundKind: "text" | "image" | "audio" | "unsupported";
  attachment?: InboundAttachment;
  /** Resposta fixa ao cliente (só com Guatá ativo) — formato desconhecido pela Meta. */
  unsupportedAutoReply?: boolean;
}

export const UNSUPPORTED_CLIENT_REPLY =
  "Recebi sua mensagem, mas esse formato ainda não consigo ler aqui. Pode mandar em texto ou uma foto?";

const UNSUPPORTED_INBOUND_NOTE = "(Cliente enviou mensagem em formato não suportado.)";

async function attachStored(
  phone: string,
  media: { bytes: Uint8Array; mimeType: string },
  mediaKind: ChatMediaKind,
): Promise<InboundAttachment> {
  const storagePath = await storeChatMedia(phone, media.bytes, media.mimeType, mediaKind);
  return { storagePath, mimeType: media.mimeType, mediaKind };
}

export async function normalizeWhatsAppInbound(
  line: Line,
  msg: Record<string, unknown>,
  organizationId?: string,
): Promise<NormalizedInbound | null> {
  const type = String(msg.type ?? "");
  const phone = String(msg.from ?? "");
  if (!phone) return null;

  if (type === "text") {
    const body = String((msg.text as { body?: string })?.body ?? "").trim();
    if (!body) return null;
    return { text: body, inboundKind: "text" };
  }

  if (type === "image" || type === "sticker") {
    const image = (msg.image ?? msg.sticker) as { id?: string; caption?: string };
    const mediaId = image?.id;
    if (!mediaId) {
      return {
        text: image?.caption?.trim() || "(Cliente enviou uma imagem.)",
        inboundKind: "image",
      };
    }
    const media = await downloadWhatsAppMedia(line, mediaId, organizationId);
    if (!media) {
      const cap = image?.caption?.trim();
      return {
        text: cap
          ? `${cap}\n\n(Não consegui abrir a imagem agora.)`
          : "(Cliente enviou uma imagem — não foi possível processar o arquivo.)",
        inboundKind: "image",
      };
    }
    const attachment = await attachStored(phone, media, "image");
    const cap = image?.caption?.trim();
    try {
      const described = await describeWhatsAppImage(
        media.bytes,
        media.mimeType,
        cap,
        organizationId,
      );
      const text = cap && !described.includes(cap) ? `${cap}\n\n${described}` : described;
      return { text, inboundKind: "image", attachment };
    } catch (e) {
      console.error("[inbound] imagem:", e);
      return {
        text:
          cap ||
          "(Cliente enviou uma imagem — erro ao interpretar. Peça mais detalhes em texto.)",
        inboundKind: "image",
        attachment,
      };
    }
  }

  if (type === "audio" || type === "voice") {
    const block = (msg.audio ?? msg.voice) as { id?: string };
    const mediaId = block?.id;
    if (!mediaId) {
      return {
        text: "(Cliente enviou um áudio.)",
        inboundKind: "audio",
      };
    }
    const media = await downloadWhatsAppMedia(line, mediaId, organizationId);
    if (!media) {
      return {
        text: "(Cliente enviou um áudio — não foi possível baixar o arquivo.)",
        inboundKind: "audio",
      };
    }
    const attachment = await attachStored(phone, media, "audio");
    try {
      const transcript = await transcribeWhatsAppAudio(media.bytes, media.mimeType, organizationId);
      if (transcript) {
        return {
          text: transcript,
          inboundKind: "audio",
          attachment,
        };
      }
    } catch (e) {
      console.error("[inbound] áudio:", e);
    }
    return {
      text:
        "(Sistema: nota de voz recebida; transcrição indisponível. Peça ao cliente, de forma breve e cordial, que repita o assunto em texto.)",
      inboundKind: "audio",
      attachment,
    };
  }

  if (type === "document") {
    const doc = msg.document as { id?: string; caption?: string; mime_type?: string };
    const mediaId = doc?.id;
    const cap = doc?.caption?.trim();
    if (!mediaId) {
      return { text: cap || "(Cliente enviou um documento.)", inboundKind: "unsupported" };
    }
    const media = await downloadWhatsAppMedia(line, mediaId, organizationId);
    if (!media) {
      return {
        text: cap || "(Cliente enviou um documento — não foi possível abrir.)",
        inboundKind: "unsupported",
      };
    }
    const mime = media.mimeType.toLowerCase();
    if (mime.startsWith("image/")) {
      const attachment = await attachStored(phone, media, "image");
      try {
        const text = await describeWhatsAppImage(media.bytes, media.mimeType, cap, organizationId);
        return { text, inboundKind: "image", attachment };
      } catch {
        return {
          text: cap || "(Cliente enviou uma imagem.)",
          inboundKind: "image",
          attachment,
        };
      }
    }
    const filename =
      (doc as { filename?: string }).filename?.trim() || "documento.pdf";
    const attachment = await attachStored(phone, media, "document");
    attachment.filename = filename;
    let text = cap || `Documento: ${filename}`;
    if (mime === "application/pdf") {
      try {
        const { extractFromFile } = await import("@/lib/knowledge.server");
        const extracted = await extractFromFile("doc.pdf", media.bytes);
        const snippet = extracted.slice(0, 800);
        if (snippet) text = cap ? `${cap}\n\n${snippet}` : snippet;
      } catch (e) {
        console.error("[inbound] documento:", e);
      }
      return {
        text,
        inboundKind: "unsupported",
        attachment: { ...attachment, mediaKind: "document" as const },
      };
    }
    return {
      text: cap || "(Cliente enviou um documento.)",
      inboundKind: "unsupported",
      attachment,
    };
  }

  if (type === "location") {
    const loc = msg.location as {
      latitude?: number;
      longitude?: number;
      name?: string;
      address?: string;
    };
    const bits = [
      loc?.name?.trim(),
      loc?.address?.trim(),
      loc?.latitude != null && loc?.longitude != null
        ? `${loc.latitude}, ${loc.longitude}`
        : "",
    ].filter(Boolean);
    const text = bits.length
      ? `(Cliente compartilhou localização: ${bits.join(" — ")})`
      : "(Cliente compartilhou localização.)";
    return { text, inboundKind: "text" };
  }

  if (type === "contacts") {
    const contacts = msg.contacts as Array<{ name?: { formatted_name?: string } }> | undefined;
    const names = (contacts ?? [])
      .map((c) => c?.name?.formatted_name?.trim())
      .filter(Boolean);
    const text =
      names.length > 0
        ? `(Cliente compartilhou contato: ${names.join(", ")})`
        : "(Cliente compartilhou um contato.)";
    return { text, inboundKind: "text" };
  }

  if (type === "button") {
    const button = msg.button as { text?: string; payload?: string };
    const text = button?.text?.trim() || button?.payload?.trim();
    if (!text) return null;
    return { text, inboundKind: "text" };
  }

  if (type === "interactive") {
    const interactive = msg.interactive as {
      button_reply?: { title?: string; id?: string };
      list_reply?: { title?: string; id?: string };
    };
    const text =
      interactive?.button_reply?.title?.trim() ||
      interactive?.list_reply?.title?.trim() ||
      interactive?.button_reply?.id?.trim() ||
      interactive?.list_reply?.id?.trim();
    if (!text) return null;
    return { text, inboundKind: "text" };
  }

  if (type === "video") {
    const video = msg.video as { id?: string; caption?: string };
    const cap = video?.caption?.trim();
    const mediaId = video?.id;
    if (!mediaId) {
      return {
        text: cap || "(Cliente enviou um vídeo.)",
        inboundKind: "unsupported",
      };
    }
    const media = await downloadWhatsAppMedia(line, mediaId, organizationId);
    if (!media) {
      return {
        text: cap || "(Cliente enviou um vídeo — não foi possível baixar o arquivo.)",
        inboundKind: "unsupported",
      };
    }
    const attachment = await attachStored(phone, media, "video");
    return {
      text: cap || "(Cliente enviou um vídeo.)",
      inboundKind: "unsupported",
      attachment,
    };
  }

  return {
    text: UNSUPPORTED_INBOUND_NOTE,
    inboundKind: "unsupported",
    unsupportedAutoReply: true,
  };
}
