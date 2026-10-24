/**
 * Recibos da Meta (enviada, entregue, visualizada, falha) ligados à mensagem do painel.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FORWARD: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

export async function applyWhatsAppDeliveryStatus(
  waMessageId: string,
  status: string,
  errorDetail?: string,
): Promise<void> {
  const next = status.trim().toLowerCase();
  if (!waMessageId || !next) return;

  const { data: rows, error } = await supabaseAdmin
    .from("messages")
    .select("id, metadata")
    .filter("metadata->>wa_message_id", "eq", waMessageId)
    .limit(5);
  if (error) {
    console.error("[whatsapp-status] busca:", error.message);
    return;
  }

  for (const row of rows ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const current = String(meta.delivery_status ?? "");
    if (next === "failed") {
      if (current === "read" || current === "delivered") continue;
      meta.delivery_status = "failed";
      if (errorDetail) meta.delivery_error = errorDetail.slice(0, 300);
    } else {
      const nextRank = FORWARD[next];
      if (!nextRank) continue;
      const currentRank = FORWARD[current] ?? 0;
      if (nextRank < currentRank) continue;
      meta.delivery_status = next;
      delete meta.delivery_error;
    }
    meta.delivery_updated_at = new Date().toISOString();
    await supabaseAdmin
      .from("messages")
      .update({ metadata: meta as never })
      .eq("id", row.id);
  }
}
