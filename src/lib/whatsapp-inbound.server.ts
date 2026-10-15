/**
 * Normaliza mensagens do webhook WhatsApp (texto, imagem, áudio) para o pipeline.
 */
import type { Line } from "@/lib/meta-send.server";
import { downloadWhatsAppMedia } from "@/lib/meta-media.server";
import {
  describeWhatsAppImage,
  transcribeWhatsAppAudio,
} from "@/lib/media-understanding.server";

export interface NormalizedInbound {
  /** Texto usado pela IA e gravado no histórico */
  text: string;
  inboundKind: "text" | "image" | "audio" | "unsupported";
}

const UNSUPPORTED_REPLY =
  "Recebi sua mensagem, mas esse formato ainda não consigo ler aqui. Pode mandar em texto ou uma foto?";

export async function normalizeWhatsAppInbound(
  line: Line,
  msg: Record<string, unknown>,
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
    const media = await downloadWhatsAppMedia(line, mediaId);
    if (!media) {
      const cap = image?.caption?.trim();
      return {
        text: cap
          ? `${cap}\n\n(Não consegui abrir a imagem agora.)`
          : "(Cliente enviou uma imagem — não foi possível processar o arquivo.)",
        inboundKind: "image",
      };
    }
    try {
      const text = await describeWhatsAppImage(
        media.bytes,
        media.mimeType,
        image?.caption,
      );
      return { text, inboundKind: "image" };
    } catch (e) {
      console.error("[inbound] imagem:", e);
      return {
        text:
          image?.caption?.trim() ||
          "(Cliente enviou uma imagem — erro ao interpretar. Peça mais detalhes em texto.)",
        inboundKind: "image",
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
    const media = await downloadWhatsAppMedia(line, mediaId);
    if (!media) {
      return {
        text: "(Cliente enviou um áudio — não foi possível baixar o arquivo.)",
        inboundKind: "audio",
      };
    }
    try {
      const transcript = await transcribeWhatsAppAudio(media.bytes, media.mimeType);
      if (transcript) {
        return {
          text: `(Áudio do cliente transcrito): ${transcript}`,
          inboundKind: "audio",
        };
      }
    } catch (e) {
      console.error("[inbound] áudio:", e);
    }
    return {
      text:
        "(Cliente enviou um áudio — não consegui transcrever. Peça para repetir em texto ou gravar de novo.)",
      inboundKind: "audio",
    };
  }

  if (type === "document") {
    const doc = msg.document as { id?: string; caption?: string; mime_type?: string };
    const mediaId = doc?.id;
    const cap = doc?.caption?.trim();
    if (!mediaId) {
      return { text: cap || "(Cliente enviou um documento.)", inboundKind: "unsupported" };
    }
    const media = await downloadWhatsAppMedia(line, mediaId);
    if (!media) {
      return {
        text: cap || "(Cliente enviou um documento — não foi possível abrir.)",
        inboundKind: "unsupported",
      };
    }
    const mime = media.mimeType.toLowerCase();
    if (mime.startsWith("image/")) {
      try {
        const text = await describeWhatsAppImage(media.bytes, media.mimeType, cap);
        return { text, inboundKind: "image" };
      } catch {
        /* fall through */
      }
    }
    if (mime === "application/pdf" || cap) {
      try {
        const { extractFromFile } = await import("@/lib/knowledge.server");
        const extracted = await extractFromFile("doc.pdf", media.bytes);
        const snippet = extracted.slice(0, 3000);
        if (snippet) {
          return {
            text: cap
              ? `${cap}\n\n(Conteúdo do documento: ${snippet})`
              : `(Cliente enviou um documento: ${snippet})`,
            inboundKind: "text",
          };
        }
      } catch (e) {
        console.error("[inbound] documento:", e);
      }
    }
    return {
      text: cap || UNSUPPORTED_REPLY,
      inboundKind: "unsupported",
    };
  }

  if (type === "video") {
    const cap = (msg.video as { caption?: string })?.caption?.trim();
    return {
      text:
        cap ||
        "(Cliente enviou um vídeo — ainda não consigo assistir. Pode mandar em texto ou foto?)",
      inboundKind: "unsupported",
    };
  }

  return {
    text: UNSUPPORTED_REPLY,
    inboundKind: "unsupported",
  };
}
