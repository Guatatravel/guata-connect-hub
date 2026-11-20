/**
 * Converte imagem/áudio do WhatsApp em texto para o pipeline do Guatá.
 * Usa a mesma rota de chave da agência (Gemini próprio) com fallback no gateway Lovable.
 */
import { chatCompletionParts, type ContentPart } from "@/lib/ai-gateway.server";
import { geminiGenerateWithParts, type GeminiInlinePart } from "@/lib/gemini-chat.server";
import { resolveAiProvider } from "@/lib/chat-provider.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

async function mediaAiProvider(organizationId?: string) {
  if (!organizationId) {
    const envGemini = process.env.GEMINI_API_KEY?.trim();
    if (envGemini) return { provider: "gemini" as const, apiKey: envGemini };
    const envLovable = process.env.LOVABLE_API_KEY?.trim();
    if (envLovable) return { provider: "lovable" as const, apiKey: envLovable };
    return null;
  }
  const { data: settings } = organizationId
    ? await supabaseAdmin
        .from("organization_ai_settings")
        .select("use_own_key, api_key, ai_provider")
        .eq("organization_id", organizationId)
        .maybeSingle()
    : { data: null };
  try {
    return await resolveAiProvider(organizationId ?? "", settings);
  } catch {
    return null;
  }
}

const TRANSCRIBE_PROMPT =
  "Transcreva integralmente o áudio em português. Responda somente com as palavras faladas, sem explicação.";

const IMAGE_PROMPT =
  "Você é o assistente do Guatá (turismo em MS). Descreva esta imagem de forma objetiva em português: o que aparece, textos visíveis em promoções/cartazes, destinos, datas e preços se houver. Máximo 6 frases curtas. Não invente o que não vê.";

async function transcribeViaGemini(
  apiKey: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const parts: GeminiInlinePart[] = [
    { text: TRANSCRIBE_PROMPT },
    { inlineData: { mimeType: mime, data: bytesToBase64(bytes) } },
  ];
  const text = await geminiGenerateWithParts(apiKey, parts, {
    maxTokens: 500,
    temperature: 0,
  });
  return text.length > 0 ? text : null;
}

async function transcribeViaLovable(
  apiKey: string | undefined,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const attempts: ContentPart[][] = [
    [
      { type: "text", text: TRANSCRIBE_PROMPT },
      {
        type: "input_audio",
        input_audio: {
          data: bytesToBase64(bytes),
          format: mime.includes("ogg") ? "ogg" : mime.includes("mpeg") ? "mp3" : "wav",
        },
      },
    ],
    [
      { type: "text", text: TRANSCRIBE_PROMPT },
      { type: "image_url", image_url: { url: toDataUrl(mime, bytes) } },
    ],
  ];
  for (const parts of attempts) {
    try {
      const text = await chatCompletionParts([{ role: "user", content: parts }], {
        maxTokens: 500,
        temperature: 0,
        apiKey,
      });
      const t = text.trim();
      if (t.length > 0) return t;
    } catch (e) {
      console.error("[media] transcrição Lovable falhou:", e);
    }
  }
  return null;
}

async function describeViaGemini(apiKey: string, bytes: Uint8Array, mime: string): Promise<string> {
  const parts: GeminiInlinePart[] = [
    { text: IMAGE_PROMPT },
    { inlineData: { mimeType: mime, data: bytesToBase64(bytes) } },
  ];
  return geminiGenerateWithParts(apiKey, parts, { maxTokens: 400, temperature: 0.2 });
}

async function describeViaLovable(
  apiKey: string | undefined,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const parts: ContentPart[] = [
    { type: "text", text: IMAGE_PROMPT },
    { type: "image_url", image_url: { url: toDataUrl(mime, bytes) } },
  ];
  return chatCompletionParts([{ role: "user", content: parts }], {
    maxTokens: 400,
    temperature: 0.2,
    apiKey,
  });
}

export async function describeWhatsAppImage(
  bytes: Uint8Array,
  mimeType: string,
  caption?: string,
  organizationId?: string,
): Promise<string> {
  const mime = normalizeMime(mimeType);
  if (!IMAGE_MIMES.has(mime) && !mime.startsWith("image/")) {
    return caption?.trim() || "O cliente enviou uma imagem.";
  }

  const route = await mediaAiProvider(organizationId);
  let description = "";
  try {
    if (route?.provider === "gemini") {
      description = await describeViaGemini(route.apiKey, bytes, mime);
    } else if (route?.provider === "lovable") {
      description = await describeViaLovable(route.apiKey, bytes, mime);
    } else {
      description = await describeViaLovable(process.env.LOVABLE_API_KEY, bytes, mime);
    }
  } catch (e) {
    console.error("[media] imagem:", e);
    if (route?.provider === "gemini") {
      try {
        description = await describeViaLovable(process.env.LOVABLE_API_KEY, bytes, mime);
      } catch (e2) {
        console.error("[media] imagem fallback:", e2);
      }
    }
  }

  const cap = caption?.trim();
  if (cap && description) return `${cap}\n\n(Conteúdo da imagem: ${description})`;
  if (description) return `(Cliente enviou uma imagem: ${description})`;
  return cap || "(Cliente enviou uma imagem.)";
}

export async function transcribeWhatsAppAudio(
  bytes: Uint8Array,
  mimeType: string,
  organizationId?: string,
): Promise<string | null> {
  const mime = normalizeMime(mimeType);
  if (!AUDIO_MIMES.has(mime) && !mime.startsWith("audio/")) {
    return null;
  }

  const route = await mediaAiProvider(organizationId);
  try {
    if (route?.provider === "gemini") {
      const t = await transcribeViaGemini(route.apiKey, bytes, mime);
      if (t) return t;
    } else if (route?.provider === "lovable") {
      const t = await transcribeViaLovable(route.apiKey, bytes, mime);
      if (t) return t;
    }
  } catch (e) {
    console.error("[media] transcrição tentativa falhou:", e);
  }

  if (route?.provider !== "lovable") {
    try {
      const t = await transcribeViaLovable(process.env.LOVABLE_API_KEY, bytes, mime);
      if (t) return t;
    } catch (e) {
      console.error("[media] transcrição fallback Lovable:", e);
    }
  }

  return null;
}