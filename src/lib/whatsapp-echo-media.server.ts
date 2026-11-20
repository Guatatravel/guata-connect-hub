/**
 * Normaliza eco do WhatsApp Business (mensagem enviada pelo app no celular) com mídia.
 */
import type { Line } from "@/lib/meta-send.server";
import { downloadWhatsAppMedia } from "@/lib/meta-media.server";
import { transcribeWhatsAppAudio } from "@/lib/media-understanding.server";
import { storeChatMedia, type ChatMediaKind } from "@/lib/chat-media.server";
import { echoTextFromRecord } from "@/lib/whatsapp-webhook.shared";

export interface EchoMediaAttachment {
  storagePath: string;
  mimeType: string;
  mediaKind: ChatMediaKind;
  filename?: string;
  outboundKind: ChatMediaKind;
}

export interface NormalizedPhoneEcho {
  text: string;
  attachment?: EchoMediaAttachment;
}

function mediaBlock(echo: Record<string, unknown>, type: string): { id?: string; mime_type?: string } | undefined {
  const block = echo[type] as { id?: string; mime_type?: string } | undefined;
  if (block?.id) return block;
  if (type === "voice") return echo.audio as { id?: string } | undefined;
  return undefined;
}

async function attachStored(
  customerPhone: string,
  media: { bytes: Uint8Array; mimeType: string },
  mediaKind: ChatMediaKind,
): Promise<EchoMediaAttachment> {
  const storagePath = await storeChatMedia(customerPhone, media.bytes, media.mimeType, mediaKind);
  return { storagePath, mimeType: media.mimeType, mediaKind, outboundKind: mediaKind };
}

/** Texto + anexo opcional para gravar eco outbound do consultor (celular). */
export async function normalizePhoneEchoMedia(
  line: Line,
  organizationId: string,
  customerPhone: string,
  echo: Record<string, unknown>,
): Promise<NormalizedPhoneEcho> {
  const type = String(echo?.type ?? "text");
  const captionText = echoTextFromRecord(echo).trim();

  const mediaTypes: Array<{ echoType: string; kind: ChatMediaKind }> = [
    { echoType: "audio", kind: "audio" },
    { echoType: "voice", kind: "audio" },
    { echoType: "image", kind: "image" },
    { echoType: "video", kind: "video" },
    { echoType: "document", kind: "document" },
  ];

  for (const { echoType, kind } of mediaTypes) {
    if (type !== echoType && !(type === "audio" && echoType === "voice")) continue;
    const block = mediaBlock(echo, echoType === "voice" ? "audio" : echoType) ?? mediaBlock(echo, type);
    const mediaId = block?.id;
    if (!mediaId) {
      if (captionText) return { text: captionText };
      return {
        text:
          kind === "audio"
            ? "(Áudio enviado pelo celular — arquivo não disponível.)"
            : `[${type} enviado pelo celular]`,
      };
    }
    const media = await downloadWhatsAppMedia(line, mediaId, organizationId);
    if (!media) {
      return {
        text: captionText || `(Mídia ${type} do celular — não foi possível baixar.)`,
      };
    }
    const attachment = await attachStored(customerPhone, media, kind);
    const docName = (echo?.document as { filename?: string } | undefined)?.filename;
    if (docName) attachment.filename = docName;

    if (kind === "audio") {
      try {
        const transcript = await transcribeWhatsAppAudio(media.bytes, media.mimeType);
        if (transcript?.trim()) return { text: transcript.trim(), attachment };
      } catch (e) {
        console.error("[echo-media] transcrição:", e);
      }
      return {
        text: captionText || "(Áudio — ouça abaixo.)",
        attachment,
      };
    }

    return { text: captionText || (kind === "image" ? "(Imagem enviada pelo celular.)" : `[${type} enviado pelo celular]`), attachment };
  }

  if (type === "text" || captionText) {
    return { text: captionText || "(mensagem pelo celular)" };
  }

  return { text: captionText || `[${type || "mensagem"} enviado pelo celular]` };
}