/**
 * Envio de mensagens via Meta WhatsApp Cloud API — server-only.
 * Suporta 2 linhas via sufixos _DESCUBRA / _VIAGENS.
 * Retorna { ok:false, reason:'not_configured' } quando os secrets faltam.
 */

type Line = "descubra" | "viagens";

function lineEnv(line: Line, key: "ACCESS_TOKEN" | "PHONE_NUMBER_ID"): string | undefined {
  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  return (
    process.env[`META_${key}${suffix}`] ?? process.env[`META_${key}`]
  );
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
  const token = lineEnv(line, "ACCESS_TOKEN");
  const phoneId = lineEnv(line, "PHONE_NUMBER_ID");
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

export function isMetaConfigured(line: Line = "descubra"): boolean {
  return Boolean(lineEnv(line, "ACCESS_TOKEN") && lineEnv(line, "PHONE_NUMBER_ID"));
}