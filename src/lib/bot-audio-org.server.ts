/**
 * Política de áudio (TTS) por organização + contagem mensal.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface OrgBotAudioPolicy {
  allowBotAudio: boolean;
  monthlyCap: number | null;
  clientDefaultOn: boolean;
  audioCountThisMonth: number;
}

function monthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getOrgBotAudioPolicy(
  organizationId: string,
): Promise<OrgBotAudioPolicy> {
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("allow_bot_audio, bot_audio_monthly_cap, bot_audio_client_default")
    .eq("id", organizationId)
    .maybeSingle();

  const allowBotAudio = Boolean(org?.allow_bot_audio);
  const capRaw = org?.bot_audio_monthly_cap;
  const monthlyCap =
    capRaw === null || capRaw === undefined ? null : Math.max(0, Number(capRaw));
  const clientDefaultOn = Boolean(org?.bot_audio_client_default);

  const mk = monthKey();
  const { data: usage } = await supabaseAdmin
    .from("organization_tts_usage")
    .select("audio_count")
    .eq("organization_id", organizationId)
    .eq("month_key", mk)
    .maybeSingle();

  return {
    allowBotAudio,
    monthlyCap,
    clientDefaultOn,
    audioCountThisMonth: Number(usage?.audio_count ?? 0),
  };
}

export function orgCanSendTtsNow(policy: OrgBotAudioPolicy): boolean {
  if (!policy.allowBotAudio) return false;
  if (policy.monthlyCap === null) return true;
  if (policy.monthlyCap <= 0) return false;
  return policy.audioCountThisMonth < policy.monthlyCap;
}

/** Sessões novas começam em texto; áudio só após nota de voz do cliente. */
export async function defaultIntakeForNewSession(
  _organizationId: string,
): Promise<Record<string, unknown>> {
  return {};
}

export async function recordOrganizationTtsUsage(
  organizationId: string,
  characters: number,
): Promise<void> {
  const mk = monthKey();
  const chars = Math.max(0, Math.min(10_000, characters));
  const { data: row } = await supabaseAdmin
    .from("organization_tts_usage")
    .select("audio_count, characters_used")
    .eq("organization_id", organizationId)
    .eq("month_key", mk)
    .maybeSingle();

  if (row) {
    await supabaseAdmin
      .from("organization_tts_usage")
      .update({
        audio_count: Number(row.audio_count ?? 0) + 1,
        characters_used: Number(row.characters_used ?? 0) + chars,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("month_key", mk);
    return;
  }

  await supabaseAdmin.from("organization_tts_usage").insert({
    organization_id: organizationId,
    month_key: mk,
    audio_count: 1,
    characters_used: chars,
  });
}

export interface OrgBotAudioSettings {
  allowBotAudio: boolean;
  monthlyCap: number | null;
  clientDefaultOn: boolean;
  audioCountThisMonth: number;
  monthlyCapDisplay: string;
}

export async function loadOrgBotAudioSettings(
  organizationId: string,
): Promise<OrgBotAudioSettings> {
  const p = await getOrgBotAudioPolicy(organizationId);
  return {
    allowBotAudio: p.allowBotAudio,
    monthlyCap: p.monthlyCap,
    clientDefaultOn: p.clientDefaultOn,
    audioCountThisMonth: p.audioCountThisMonth,
    monthlyCapDisplay:
      p.monthlyCap === null ? "Ilimitado" : String(p.monthlyCap),
  };
}

export async function saveOrgBotAudioSettings(
  organizationId: string,
  input: {
    allowBotAudio: boolean;
    monthlyCap: number | null;
    clientDefaultOn: boolean;
  },
): Promise<void> {
  const cap =
    input.monthlyCap === null
      ? null
      : Math.max(0, Math.min(1_000_000, Math.floor(input.monthlyCap)));

  await supabaseAdmin
    .from("organizations")
    .update({
      allow_bot_audio: input.allowBotAudio,
      bot_audio_monthly_cap: input.allowBotAudio ? cap : null,
      bot_audio_client_default: input.clientDefaultOn,
      updated_at: new Date().toISOString(),
    })
    .eq("id", organizationId);
}
