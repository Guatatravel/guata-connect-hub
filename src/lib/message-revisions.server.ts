import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MessageMeta = Record<string, unknown>;

async function rowsByWaMessageId(waMessageId: string) {
  const { data: rows } = await supabaseAdmin
    .from("messages")
    .select("id, metadata, text")
    .filter("metadata->>wa_message_id", "eq", waMessageId.trim())
    .limit(20);
  return rows ?? [];
}

/** Webhook: cliente ou celular apagou mensagem (coexistência / revoke). */
export async function applyWhatsAppMessageRevoke(originalWaMessageId: string): Promise<void> {
  const id = originalWaMessageId.trim();
  if (!id) return;
  const now = new Date().toISOString();
  for (const row of await rowsByWaMessageId(id)) {
    const prev = (row.metadata ?? {}) as MessageMeta;
    if (prev.deleted_at) continue;
    await supabaseAdmin
      .from("messages")
      .update({
        text: "",
        metadata: {
          ...prev,
          deleted_at: now,
          deleted_for_everyone: true,
        } as never,
      })
      .eq("id", row.id);
  }
}

/** Webhook: mensagem editada no WhatsApp. */
export async function applyWhatsAppMessageEdit(
  originalWaMessageId: string,
  newText: string,
): Promise<void> {
  const id = originalWaMessageId.trim();
  if (!id) return;
  const now = new Date().toISOString();
  for (const row of await rowsByWaMessageId(id)) {
    const prev = (row.metadata ?? {}) as MessageMeta;
    if (prev.deleted_at) continue;
    await supabaseAdmin
      .from("messages")
      .update({
        text: newText.slice(0, 4000),
        metadata: { ...prev, edited_at: now } as never,
      })
      .eq("id", row.id);
  }
}

export async function markMessageDeletedLocally(
  messageRowId: string,
  extraMeta: MessageMeta,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("id", messageRowId)
    .maybeSingle();
  const metadata = {
    ...((row?.metadata as MessageMeta | null) ?? {}),
    ...extraMeta,
    deleted_at: now,
    deleted_for_everyone: true,
  };
  await supabaseAdmin
    .from("messages")
    .update({ text: "", metadata: metadata as never })
    .eq("id", messageRowId);
}

export async function markMessageEditedLocally(
  messageRowId: string,
  newText: string,
  extraMeta: MessageMeta,
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await supabaseAdmin
    .from("messages")
    .select("metadata, text")
    .eq("id", messageRowId)
    .maybeSingle();
  const prev = (row?.metadata as MessageMeta | null) ?? {};
  const metadata = {
    ...prev,
    ...extraMeta,
    edited_at: now,
    previous_text: typeof row?.text === "string" ? row.text.slice(0, 4000) : undefined,
  };
  await supabaseAdmin
    .from("messages")
    .update({ text: newText.slice(0, 4000), metadata: metadata as never })
    .eq("id", messageRowId);
}
