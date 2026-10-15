/**
 * Converte imagem/áudio do WhatsApp em texto para o pipeline do Guatá.
 */
import { chatCompletionParts, type ContentPart } from "@/lib/ai-gateway.server";

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function toDataUrl(mime: string, bytes: Uint8Array): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const AUDIO_MIMES = new Set([
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/opus",
]);

function normalizeMime(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/ogg" || mime.includes("opus")) return "audio/ogg";
  return base;
}

export async function describeWhatsAppImage(
  bytes: Uint8Array,
  mimeType: string,
  caption?: string,
): Promise<string> {
  const mime = normalizeMime(mimeType);
  if (!IMAGE_MIMES.has(mime) && !mime.startsWith("image/")) {
    return caption?.trim() || "O cliente enviou uma imagem.";
  }

  const parts: ContentPart[] = [
    {
      type: "text",
      text:
        "Você é o assistente do Guatá (turismo em MS). Descreva esta imagem de forma objetiva em português: o que aparece, textos visíveis em promoções/cartazes, destinos, datas e preços se houver. Máximo 6 frases curtas. Não invente o que não vê.",
    },
    {
      type: "image_url",
      image_url: { url: toDataUrl(mime, bytes) },
    },
  ];

  const description = await chatCompletionParts(
    [{ role: "user", content: parts }],
    { maxTokens: 400, temperature: 0.2 },
  );

  const cap = caption?.trim();
  if (cap && description) return `${cap}\n\n(Conteúdo da imagem: ${description})`;
  if (description) return `(Cliente enviou uma imagem: ${description})`;
  return cap || "(Cliente enviou uma imagem.)";
}

export async function transcribeWhatsAppAudio(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  const mime = normalizeMime(mimeType);
  if (!AUDIO_MIMES.has(mime) && !mime.startsWith("audio/")) {
    return null;
  }

  const attempts: ContentPart[][] = [
    [
      {
        type: "text",
        text:
          "Transcreva integralmente o áudio em português. Responda somente com as palavras faladas, sem explicação.",
      },
      {
        type: "input_audio",
        input_audio: {
          data: bytesToBase64(bytes),
          format: mime.includes("ogg") ? "ogg" : mime.includes("mpeg") ? "mp3" : "wav",
        },
      },
    ],
    [
      {
        type: "text",
        text:
          "Transcreva integralmente o áudio em português. Responda somente com as palavras faladas, sem explicação.",
      },
      {
        type: "image_url",
        image_url: { url: toDataUrl(mime, bytes) },
      },
    ],
  ];

  for (const parts of attempts) {
    try {
      const text = await chatCompletionParts(
        [{ role: "user", content: parts }],
        { maxTokens: 500, temperature: 0 },
      );
      const t = text.trim();
      if (t.length > 0) return t;
    } catch (e) {
      console.error("[media] transcrição tentativa falhou:", e);
    }
  }
  return null;
}
