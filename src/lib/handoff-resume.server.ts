/**
 * Retomada automática do Guatá após handoff humano (timeout 10 min).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;

/** Devolve a conversa ao Guatá sem mensagem fixa — o bot responde na próxima fala do cliente. */
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
    .update({ mode: "bot", intake_data: intake as never })
    .eq("id", sessionId);
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