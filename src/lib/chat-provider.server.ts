/**
 * Roteia a IA entre Gemini (AI Studio) e Lovable Gateway.
 */
import type { ChatMessage } from "@/lib/ai-gateway.server";
import { chatCompletion } from "@/lib/ai-gateway.server";
import { geminiChatCompletion, looksLikeGeminiApiKey } from "@/lib/gemini-chat.server";
import { getGuataOrganizationId } from "@/lib/organizations.server";

export type AiProvider = "lovable" | "gemini";

export async function resolveAiProvider(
  organizationId: string,
  settings: {
    use_own_key?: boolean;
    api_key?: string | null;
    ai_provider?: string | null;
  } | null,
): Promise<{ provider: AiProvider; apiKey: string }> {
  const prefer = settings?.ai_provider?.trim();
  const envGemini = process.env.GEMINI_API_KEY?.trim();
  const envLovable = process.env.LOVABLE_API_KEY?.trim();

  if (settings?.use_own_key && settings.api_key?.trim()) {
    const key = settings.api_key.trim();
    if (prefer === "gemini" || (prefer !== "lovable" && looksLikeGeminiApiKey(key))) {
      return { provider: "gemini", apiKey: key };
    }
    return { provider: "lovable", apiKey: key };
  }

  const guataId = await getGuataOrganizationId();
  const isGuata = organizationId === guataId;
  if (prefer === "lovable" && envLovable) return { provider: "lovable", apiKey: envLovable };
  if (prefer === "gemini" && envGemini) return { provider: "gemini", apiKey: envGemini };

  if (envGemini && (isGuata || prefer !== "lovable")) {
    return { provider: "gemini", apiKey: envGemini };
  }
  if (envLovable) return { provider: "lovable", apiKey: envLovable };
  if (envGemini) return { provider: "gemini", apiKey: envGemini };
  throw new Error("Nenhuma chave de IA configurada no servidor.");
}

export async function chatWithProvider(
  provider: AiProvider,
  apiKey: string,
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  if (provider === "gemini") return geminiChatCompletion(messages, apiKey, opts);
  return chatCompletion(messages, { ...opts, apiKey });
}