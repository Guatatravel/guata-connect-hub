/**
 * Pausa global do Guatá por organização + contagem estimada de msgs service.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SERVICE_FREE_TIER = 1000;

export function serviceFreeTier(): number {
  return SERVICE_FREE_TIER;
}

export async function getOrgBotPausedAt(organizationId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("bot_paused_at")
    .eq("id", organizationId)
    .maybeSingle();
  const raw = (data as { bot_paused_at?: string | null } | null)?.bot_paused_at;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export async function isOrgBotPaused(organizationId: string): Promise<boolean> {
  return Boolean(await getOrgBotPausedAt(organizationId));
}

export async function setOrgBotPaused(
  organizationId: string,
  paused: boolean,
): Promise<{ botPausedAt: string | null }> {
  const bot_paused_at = paused ? new Date().toISOString() : null;
  const { error } = await supabaseAdmin
    .from("organizations")
    .update({ bot_paused_at, updated_at: new Date().toISOString() } as never)
    .eq("id", organizationId);
  if (error) throw new Error(error.message);

  if (paused) {
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano" })
      .eq("organization_id", organizationId)
      .eq("mode", "bot");
  }

  return { botPausedAt: bot_paused_at };
}

/** Início do mês no fuso America/Cuiaba (aproximação UTC-4). */
export function currentServicePeriodBounds(now = new Date()): { startIso: string; endIso: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const startIso = `${y}-${m}-01T04:00:00.000Z`;
  const nextM = Number(m) === 12 ? 1 : Number(m) + 1;
  const nextY = Number(m) === 12 ? Number(y) + 1 : Number(y);
  const endIso = `${nextY}-${String(nextM).padStart(2, "0")}-01T04:00:00.000Z`;
  return { startIso, endIso };
}

/**
 * Conta msgs outbound do bot/agente no mês (proxy das service da Cloud API).
 * Não inclui templates de campanha com kind campaign_template se filtrável — conta author bot|agent.
 */
export async function countEstimatedServiceMessages(
  organizationId: string,
): Promise<{ count: number; freeTier: number }> {
  const { startIso, endIso } = currentServicePeriodBounds();
  const sessionIds = await sessionIdsForOrg(organizationId);
  if (sessionIds.length === 0) return { count: 0, freeTier: SERVICE_FREE_TIER };

  let total = 0;
  const chunk = 200;
  for (let i = 0; i < sessionIds.length; i += chunk) {
    const slice = sessionIds.slice(i, i + chunk);
    const { count, error } = await supabaseAdmin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("session_id", slice)
      .eq("direction", "out")
      .in("author", ["bot", "agent"])
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    if (error) {
      console.error("[bot-pause] count:", error.message);
      continue;
    }
    total += count ?? 0;
  }
  return { count: total, freeTier: SERVICE_FREE_TIER };
}

async function sessionIdsForOrg(organizationId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(5000);
  return (data ?? []).map((r) => r.id as string);
}

export async function getMetaAjudaStatus(organizationId: string): Promise<{
  botPaused: boolean;
  botPausedAt: string | null;
  serviceCount: number;
  freeTier: number;
}> {
  const [pausedAt, usage] = await Promise.all([
    getOrgBotPausedAt(organizationId),
    countEstimatedServiceMessages(organizationId),
  ]);
  return {
    botPaused: Boolean(pausedAt),
    botPausedAt: pausedAt,
    serviceCount: usage.count,
    freeTier: usage.freeTier,
  };
}
