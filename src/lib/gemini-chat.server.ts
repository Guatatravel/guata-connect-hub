/**
 * Google Gemini (AI Studio) — server-only. Chave nunca vai ao navegador.
 */
import type { ChatMessage } from "@/lib/ai-gateway.server";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";

function geminiModel(model?: string): string {
  const m = model?.trim();
  if (!m) return DEFAULT_MODEL;
  if (m.startsWith("gemini-") || m.startsWith("google/")) return m.replace(/^google\//, "");
  return DEFAULT_MODEL;
}

export function looksLikeGeminiApiKey(key: string): boolean {
  return key.trim().startsWith("AIza");
}

export async function geminiChatCompletion(
  messages: ChatMessage[],
  apiKey: string,
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new Error("Chave Gemini não configurada");

  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content.trim())
    .filter(Boolean);
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

  if (turns.length === 0) return "";

  const body: Record<string, unknown> = {
    contents: turns,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.5,
    },
  };
  if (systemParts.length > 0) {
    body.systemInstruction = { parts: [{ text: systemParts.join("\n\n") }] };
  }

  const model = geminiModel(opts.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (res.status === 429) throw new Error("rate_limit");
  if (res.status === 402 || res.status === 403) {
    const text = await res.text().catch(() => "");
    if (/quota|billing|exceeded|RESOURCE_EXHAUSTED/i.test(text)) throw new Error("credits_exhausted");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text.trim();
}