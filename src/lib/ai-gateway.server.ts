/**
 * Cliente Lovable AI Gateway — server-only.
 * Usa LOVABLE_API_KEY (auto-provisionado pela Lovable Cloud).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };

export interface ChatMessageParts {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function gatewayRequest(
  messages: ChatMessage[] | ChatMessageParts[],
  opts: { model?: string; maxTokens?: number; temperature?: number },
): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY não configurada");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "raw",
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-2.5-flash",
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.5,
    }),
  });

  if (res.status === 429) throw new Error("rate_limit");
  if (res.status === 402) throw new Error("credits_exhausted");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI Gateway ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p && "text" in p ? String(p.text) : ""))
      .join("")
      .trim();
  }
  return "";
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  return gatewayRequest(messages, opts);
}

export async function chatCompletionParts(
  messages: ChatMessageParts[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  return gatewayRequest(messages, opts);
}

/** Classifica intent em uma palavra. */
export async function classifyIntent(
  userText: string,
): Promise<"turismo_geral" | "agencia" | "humano" | "saudacao"> {
  const out = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Classifique a mensagem do usuário em UMA palavra: turismo_geral (perguntas sobre destinos, eventos, atrações de MS), agencia (quer comprar pacote/orçamento/reserva), humano (quer falar com pessoa), saudacao (oi/bom dia). Responda só a palavra.",
      },
      { role: "user", content: userText },
    ],
    { maxTokens: 10, temperature: 0 },
  );
  const norm = out.toLowerCase().replace(/[^a-z_]/g, "");
  if (["turismo_geral", "agencia", "humano", "saudacao"].includes(norm)) {
    return norm as "turismo_geral" | "agencia" | "humano" | "saudacao";
  }
  return "turismo_geral";
}