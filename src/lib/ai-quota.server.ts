/**
 * Decide qual chave de IA a agência usa e conta as respostas do período.
 * A Guatá não entra no teto de respostas. O crédito incluso da Lovable é da workspace.
 */
import type { ChatMessage } from "@/lib/ai-gateway.server";
import { chatCompletion } from "@/lib/ai-gateway.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getGuataOrganizationId } from "@/lib/organizations.server";
import { aiPeriodKey, aiPeriodResetsOn, LOVABLE_INCLUDED_AI_CREDITS } from "@/lib/ai-quota.shared";

export interface AiQuotaNotice {
  includedCredits: number;
  periodKey: string;
  resetsOn: string;
  calls: number;
  replyCap: number | null;
  useOwnKey: boolean;
  hasOwnKey: boolean;
  blocked: boolean;
  blockedReason: "credits" | "quota" | null;
  isGuata: boolean;
  canEdit: boolean;
  canSetCap: boolean;
}

async function policyRow() {
  const { data } = await supabaseAdmin
    .from("platform_ai_policy")
    .select("reply_cap, credits_blocked_period")
    .eq("id", 1)
    .maybeSingle();
  return data;
}

async function settingsRow(organizationId: string) {
  const { data } = await supabaseAdmin
    .from("organization_ai_settings")
    .select("use_own_key, api_key, credits_blocked_period")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data;
}

async function callsThisPeriod(organizationId: string, periodKey: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("organization_ai_usage")
    .select("calls")
    .eq("organization_id", organizationId)
    .eq("period_key", periodKey)
    .maybeSingle();
  return Number(data?.calls ?? 0);
}

export async function loadAiQuotaNotice(
  organizationId: string,
  canEdit: boolean,
): Promise<AiQuotaNotice> {
  const periodKey = aiPeriodKey();
  const [guataId, policy, settings, calls] = await Promise.all([
    getGuataOrganizationId(),
    policyRow(),
    settingsRow(organizationId),
    callsThisPeriod(organizationId, periodKey),
  ]);
  const isGuata = organizationId === guataId;
  const useOwnKey = Boolean(settings?.use_own_key && settings.api_key?.trim());
  const ownBlocked = settings?.credits_blocked_period === periodKey;
  const platformBlocked = policy?.credits_blocked_period === periodKey;
  const replyCap = policy?.reply_cap ?? null;
  const overCap = !isGuata && !useOwnKey && replyCap !== null && calls >= replyCap;
  const creditsBlocked = useOwnKey ? ownBlocked : platformBlocked;
  return {
    includedCredits: LOVABLE_INCLUDED_AI_CREDITS,
    periodKey,
    resetsOn: aiPeriodResetsOn(periodKey),
    calls,
    replyCap,
    useOwnKey,
    hasOwnKey: Boolean(settings?.api_key?.trim()),
    blocked: overCap || creditsBlocked,
    blockedReason: overCap ? "quota" : creditsBlocked ? "credits" : null,
    isGuata,
    canEdit,
    canSetCap: isGuata && canEdit,
  };
}

async function markBlocked(organizationId: string, useOwnKey: boolean, periodKey: string) {
  if (useOwnKey) {
    await supabaseAdmin
      .from("organization_ai_settings")
      .update({ credits_blocked_period: periodKey, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    return;
  }
  await supabaseAdmin.from("platform_ai_policy").update({ credits_blocked_period: periodKey }).eq("id", 1);
}

async function clearBlocked(organizationId: string, useOwnKey: boolean) {
  if (useOwnKey) {
    await supabaseAdmin
      .from("organization_ai_settings")
      .update({ credits_blocked_period: null, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId);
    return;
  }
  await supabaseAdmin.from("platform_ai_policy").update({ credits_blocked_period: null }).eq("id", 1);
}

async function recordCall(organizationId: string, periodKey: string) {
  const current = await callsThisPeriod(organizationId, periodKey);
  if (current > 0) {
    await supabaseAdmin
      .from("organization_ai_usage")
      .update({ calls: current + 1 })
      .eq("organization_id", organizationId)
      .eq("period_key", periodKey);
    return;
  }
  await supabaseAdmin.from("organization_ai_usage").insert({
    organization_id: organizationId,
    period_key: periodKey,
    calls: 1,
  });
}

export async function chatForOrganization(
  organizationId: string,
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const notice = await loadAiQuotaNotice(organizationId, false);
  if (notice.blockedReason === "quota") throw new Error("ai_quota");
  if (notice.blockedReason === "credits") throw new Error("credits_exhausted");

  const settings = await settingsRow(organizationId);
  const ownKey = settings?.use_own_key ? settings.api_key?.trim() : "";
  if (settings?.use_own_key && !ownKey) throw new Error("LOVABLE_API_KEY não configurada");

  try {
    const answer = await chatCompletion(messages, { ...opts, apiKey: ownKey || undefined });
    await clearBlocked(organizationId, Boolean(ownKey));
    await recordCall(organizationId, notice.periodKey);
    return answer;
  } catch (error) {
    if (error instanceof Error && error.message === "credits_exhausted") {
      await markBlocked(organizationId, Boolean(ownKey), notice.periodKey);
    }
    throw error;
  }
}

export async function saveAiQuotaSettings(
  organizationId: string,
  input: { useOwnKey: boolean; apiKey?: string | null; clearKey?: boolean; replyCap?: number | null },
  canSetCap: boolean,
): Promise<void> {
  const current = await settingsRow(organizationId);
  let apiKey = current?.api_key ?? null;
  if (input.clearKey) apiKey = null;
  else if (input.apiKey?.trim()) apiKey = input.apiKey.trim();
  const useOwnKey = input.useOwnKey && Boolean(apiKey);
  await supabaseAdmin.from("organization_ai_settings").upsert(
    {
      organization_id: organizationId,
      use_own_key: useOwnKey,
      api_key: apiKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (canSetCap && input.replyCap !== undefined) {
    const cap = input.replyCap === null ? null : Math.max(0, Math.min(1_000_000, Math.floor(input.replyCap)));
    await supabaseAdmin.from("platform_ai_policy").update({ reply_cap: cap }).eq("id", 1);
  }
}
