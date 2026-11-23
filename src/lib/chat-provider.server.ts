/**
 * Roteia a IA entre Gemini (AI Studio) e Lovable Gateway.
 */
import type { ChatMessage } from "@/lib/ai-gateway.server";
import { chatCompletion } from "@/lib/ai-gateway.server";
import { geminiChatCompletion, looksLikeGeminiApiKey } from "@/lib/gemini-chat.server";
import { getGuataOrganizationId } from "@/lib/organizations.server";
import { isTransientAiError } from "@/lib/ai-retry.server";

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

function fallbackLovableKey(
  primary: AiProvider,
  settings: {
    use_own_key?: boolean;
    api_key?: string | null;
    ai_provider?: string | null;
  } | null,
): string | null {
  if (primary !== "gemini") return null;
  const envLovable = process.env.LOVABLE_API_KEY?.trim();
  if (settings?.use_own_key && settings.api_key?.trim()) {
    const key = settings.api_key.trim();
    if (!looksLikeGeminiApiKey(key) && settings.ai_provider === "lovable") return key;
  }
  return envLovable || null;
}

export async function chatWithProvider(
  provider: AiProvider,
  apiKey: string,
  messages: ChatMessage[],
  opts: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    /** Chave Lovable para fallback se Gemini estiver congestionado. */
    fallbackLovableKey?: string | null;
  } = {},
): Promise<string> {
  try {
    if (provider === "gemini") return await geminiChatCompletion(messages, apiKey, opts);
    return await chatCompletion(messages, { ...opts, apiKey });
  } catch (e) {
    const lovableKey = opts.fallbackLovableKey?.trim();
    if (provider === "gemini" && lovableKey && isTransientAiError(e)) {
      console.warn("[chat-provider] Gemini transitório — fallback Lovable");
      return chatCompletion(messages, { ...opts, apiKey: lovableKey });
    }
    throw e;
  }
}

export async function chatWithProviderResolved(
  organizationId: string,
  settings: {
    use_own_key?: boolean;
    api_key?: string | null;
    ai_provider?: string | null;
  } | null,
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const { provider, apiKey } = await resolveAiProvider(organizationId, settings);
  return chatWithProvider(provider, apiKey, messages, {
    ...opts,
    fallbackLovableKey: fallbackLovableKey(provider, settings),
  });
}
