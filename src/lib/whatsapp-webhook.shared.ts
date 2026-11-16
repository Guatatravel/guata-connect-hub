/** Campos que o app Meta deve inscrever para WhatsApp + coexistência. */
export const META_WHATSAPP_WEBHOOK_FIELDS = [
  "messages",
  "message_echoes",
  "smb_message_echoes",
] as const;

export type WebhookChangeSlice = {
  field?: string;
  value: Record<string, unknown>;
};

/** Cada change do payload Meta (coexistência manda ecoo em change separado). */
export function iterateWebhookChanges(payload: unknown): WebhookChangeSlice[] {
  const entries = (payload as { entry?: unknown[] } | null)?.entry;
  if (!Array.isArray(entries)) return [];
  const out: WebhookChangeSlice[] = [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const raw of changes) {
      const ch = raw as { field?: string; value?: Record<string, unknown> };
      if (!ch?.value || typeof ch.value !== "object") continue;
      out.push({ field: ch.field, value: ch.value });
    }
  }
  return out;
}

export function phoneNumberIdFromValue(value: Record<string, unknown>): string {
  const meta = value.metadata as { phone_number_id?: string | number } | undefined;
  const id = meta?.phone_number_id;
  if (id === undefined || id === null) return "";
  return String(id).trim();
}

export function firstPhoneNumberIdFromPayload(payload: unknown): string {
  for (const { value } of iterateWebhookChanges(payload)) {
    const id = phoneNumberIdFromValue(value);
    if (id) return id;
  }
  return "";
}

export function webhookEventKindFromPayload(payload: unknown): string {
  let fallback: string = "other";
  for (const { value } of iterateWebhookChanges(payload)) {
    const kind = webhookEventKind(value);
    if (kind === "message") return "message";
    if (kind === "phone_echo") fallback = "phone_echo";
    else if (kind === "status" && fallback === "other") fallback = "status";
  }
  return fallback;
}

export function mergedWebhookPreview(payload: unknown): string {
  for (const { value } of iterateWebhookChanges(payload)) {
    const line = webhookPreview(value);
    if (line) return line;
  }
  return "";
}

export function webhookEventKind(value: Record<string, unknown>): string {
  if (Array.isArray(value.messages) && value.messages.length > 0) return "message";
  if (Array.isArray(value.statuses) && value.statuses.length > 0) return "status";
  const echoes = phoneEchoesFromValue(value);
  if (echoes.length > 0) return "phone_echo";
  return "other";
}

export function phoneEchoesFromValue(value: Record<string, unknown>): unknown[] {
  return [
    ...(Array.isArray(value.message_echoes) ? value.message_echoes : []),
    ...(Array.isArray(value.smb_message_echoes) ? value.smb_message_echoes : []),
  ];
}

/** Texto legível de um eco (mensagem enviada pelo app no celular). */
export function echoTextFromRecord(echo: Record<string, unknown>): string {
  const type = String(echo?.type ?? "mensagem");
  const text =
    (echo?.text as { body?: string } | undefined)?.body?.trim() ??
    (echo?.image as { caption?: string } | undefined)?.caption?.trim() ??
    (echo?.video as { caption?: string } | undefined)?.caption?.trim() ??
    (echo?.document as { caption?: string; filename?: string } | undefined)?.caption?.trim() ??
    (echo?.button as { text?: string } | undefined)?.text?.trim() ??
    (echo?.interactive as { body?: { text?: string } })?.body?.text?.trim();
  if (text) return text;
  const docName = (echo?.document as { filename?: string } | undefined)?.filename;
  if (docName) return `[documento: ${docName}]`;
  if (type && type !== "mensagem") return `[${type} enviado pelo celular]`;
  return "";
}

export function echoCustomerPhone(echo: Record<string, unknown>): string {
  const to = String(echo?.to ?? "").trim();
  if (to) return to;
  return String(echo?.recipient_id ?? "").trim();
}

export function webhookPreview(value: Record<string, unknown>): string {
  const msg = (value.messages as Record<string, unknown>[] | undefined)?.[0];
  if (msg) {
    const from = String(msg.from ?? "?");
    const body = (msg.text as { body?: string } | undefined)?.body ?? msg.type;
    return `Mensagem de ${from}: ${body}`;
  }
  const st = (value.statuses as Record<string, unknown>[] | undefined)?.[0];
  if (st) return `Status "${st.status}" para ${st.recipient_id}`;
  const echo = phoneEchoesFromValue(value)[0] as Record<string, unknown> | undefined;
  if (echo) {
    const body =
      (echo.text as { body?: string })?.body ??
      (echo.image as { caption?: string })?.caption ??
      echo.type;
    return `Eco do celular para ${echo.to}: ${body}`;
  }
  return "";
}