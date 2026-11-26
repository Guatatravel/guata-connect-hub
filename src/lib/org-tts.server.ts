/**
 * Credenciais de voz (ElevenLabs) por organização.
 * Sem chave da agência, o BOT usa o segredo do servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OrgElevenLabsCreds = {
  useOwn: boolean;
  apiKey: string | null;
  voiceMaleId: string | null;
  voiceFemaleId: string | null;
};

export async function loadOrgElevenLabsCreds(
  organizationId: string,
): Promise<OrgElevenLabsCreds> {
  const { data } = await supabaseAdmin
    .from("organization_ai_settings")
    .select(
      "use_own_elevenlabs, elevenlabs_api_key, elevenlabs_voice_male_id, elevenlabs_voice_female_id",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  const row = data as {
    use_own_elevenlabs?: boolean;
    elevenlabs_api_key?: string | null;
    elevenlabs_voice_male_id?: string | null;
    elevenlabs_voice_female_id?: string | null;
  } | null;
  return {
    useOwn: Boolean(row?.use_own_elevenlabs && row.elevenlabs_api_key?.trim()),
    apiKey: row?.elevenlabs_api_key?.trim() || null,
    voiceMaleId: row?.elevenlabs_voice_male_id?.trim() || null,
    voiceFemaleId: row?.elevenlabs_voice_female_id?.trim() || null,
  };
}

export type OrgTtsNotice = {
  useOwnElevenlabs: boolean;
  hasOwnElevenlabsKey: boolean;
  hasMaleVoiceId: boolean;
  hasFemaleVoiceId: boolean;
  serverHasElevenlabs: boolean;
  canEdit: boolean;
};

export async function loadOrgTtsNotice(
  organizationId: string,
  canEdit: boolean,
): Promise<OrgTtsNotice> {
  const { data } = await supabaseAdmin
    .from("organization_ai_settings")
    .select(
      "use_own_elevenlabs, elevenlabs_api_key, elevenlabs_voice_male_id, elevenlabs_voice_female_id",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  const row = data as {
    use_own_elevenlabs?: boolean;
    elevenlabs_api_key?: string | null;
    elevenlabs_voice_male_id?: string | null;
    elevenlabs_voice_female_id?: string | null;
  } | null;
  return {
    useOwnElevenlabs: Boolean(row?.use_own_elevenlabs),
    hasOwnElevenlabsKey: Boolean(row?.elevenlabs_api_key?.trim()),
    hasMaleVoiceId: Boolean(row?.elevenlabs_voice_male_id?.trim()),
    hasFemaleVoiceId: Boolean(row?.elevenlabs_voice_female_id?.trim()),
    serverHasElevenlabs: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    canEdit,
  };
}

export async function saveOrgElevenLabsSettings(
  organizationId: string,
  input: {
    useOwnElevenlabs: boolean;
    apiKey?: string | null;
    clearKey?: boolean;
    voiceMaleId?: string | null;
    voiceFemaleId?: string | null;
  },
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("organization_ai_settings")
    .select("organization_id, elevenlabs_api_key")
    .eq("organization_id", organizationId)
    .maybeSingle();

  let elevenlabs_api_key: string | null | undefined = undefined;
  if (input.clearKey) {
    elevenlabs_api_key = null;
  } else if (input.apiKey?.trim()) {
    elevenlabs_api_key = input.apiKey.trim();
  }

  const patch: Record<string, unknown> = {
    use_own_elevenlabs: input.useOwnElevenlabs,
    updated_at: new Date().toISOString(),
  };
  if (elevenlabs_api_key !== undefined) {
    patch.elevenlabs_api_key = elevenlabs_api_key;
  }
  if (input.voiceMaleId !== undefined) {
    patch.elevenlabs_voice_male_id = input.voiceMaleId?.trim() || null;
  }
  if (input.voiceFemaleId !== undefined) {
    patch.elevenlabs_voice_female_id = input.voiceFemaleId?.trim() || null;
  }

  if (existing) {
    const { error } = await supabaseAdmin
      .from("organization_ai_settings")
      .update(patch as never)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabaseAdmin.from("organization_ai_settings").insert({
      organization_id: organizationId,
      use_own_key: false,
      ai_provider: "auto",
      ...patch,
    } as never);
    if (error) throw new Error(error.message);
  }
}
