/**
 * Retomada automática do Guatá após handoff humano (timeout 10 min).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/meta-send.server";

export const HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;

function resumeText(firstName?: string | null): string {
  const n = firstName ? `, ${firstName}` : "";
  return `Oi${n}! Enquanto nosso consultor finaliza outro atendimento, eu já sigo com você para adiantar tudo. Me conta: para quando você está pensando essa viagem e quantas pessoas vão?`;
}

async function persistBotOutbound(sessionId: string, text: string, metadata: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("messages")
    .insert({
      session_id: sessionId,
      direction: "out",
      author: "bot",
      text,
      metadata: metadata as never,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[handoff] persist:", error.message);
    return null;
  }
  await supabaseAdmin
    .from("sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
  return data.id as string;
}

async function attachWaMessageId(rowId: string | null, waMessageId?: string) {
  if (!rowId || !waMessageId) return;
  const { data } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("id", rowId)
    .maybeSingle();
  const metadata = { ...((data?.metadata ?? {}) as Record<string, unknown>), wa_message_id: waMessageId };
  await supabaseAdmin.from("messages").update({ metadata: metadata as never }).eq("id", rowId);
}

/** Devolve a conversa ao Guatá e avisa o cliente. */
export async function resumeBotForSession(sessionId: string, reason: string) {
  const { data: s } = await supabaseAdmin
    .from("sessions")
    .select("id, phone, line, contact_name, intake_data, organization_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return;
  const intake = { ...((s.intake_data ?? {}) as Record<string, unknown>) };
  delete intake["owner_alert_at"];
  intake["handoff_resumed_at"] = new Date().toISOString();
  intake["handoff_resumed_reason"] = reason;
  await supabaseAdmin
    .from("sessions")
    .update({ mode: "bot", intake_state: null, intake_data: intake as never })
    .eq("id", sessionId);
  const text = resumeText(String(s.contact_name ?? "").trim().split(/\s+/)[0] || null);
  const rowId = await persistBotOutbound(sessionId, text, { handoff_resume: reason });
  const res = await sendWhatsAppText(
    { organizationId: s.organization_id as string, line: s.line as "descubra" | "viagens" },
    String(s.phone),
    text,
  ).catch((e) => ({ ok: false, reason: String(e) }) as const);
  if (res.ok) await attachWaMessageId(rowId, "messageId" in res ? res.messageId : undefined);
  else console.error("[handoff] retomada falhou:", res.reason);
}

async function resumeStaleHandoffsForOrg(organizationId: string) {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, intake_data")
    .eq("organization_id", organizationId)
    .eq("mode", "humano")
    .limit(50);
  const now = Date.now();
  for (const s of data ?? []) {
    const at = (s.intake_data as Record<string, unknown> | null)?.["owner_alert_at"];
    if (typeof at !== "string" || now - Date.parse(at) < HANDOFF_TIMEOUT_MS) continue;
    const { count } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("session_id", s.id)
      .eq("author", "agent")
      .gte("created_at", at);
    if ((count ?? 0) > 0) {
      const intake = { ...((s.intake_data as Record<string, unknown> | null) ?? {}) };
      delete intake["owner_alert_at"];
      await supabaseAdmin.from("sessions").update({ intake_data: intake as never }).eq("id", s.id);
      continue;
    }
    await resumeBotForSession(s.id, "timeout");
  }
}

/** Uma org (ex.: ao processar mensagem). */
export async function resumeStaleHandoffs(organizationId: string) {
  await resumeStaleHandoffsForOrg(organizationId);
}

/** Todas as orgs com sessão em handoff — para cron / webhook global. */
export async function resumeStaleHandoffsForAllOrganizations() {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("organization_id")
    .eq("mode", "humano")
    .limit(200);
  const orgIds = [...new Set((data ?? []).map((r) => r.organization_id as string).filter(Boolean))];
  for (const orgId of orgIds) {
    await resumeStaleHandoffsForOrg(orgId);
  }
}
