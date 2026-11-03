/**
 * Configuração do Passhub por organização — server-only.
 * A chave da API nunca sai do servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clampValidity, QUOTE_DEFAULT_VALIDITY_MIN } from "@/lib/quote-format";

export type PasshubSettingsRow = {
  enabled: boolean;
  api_key: string | null;
  mod_aereo: boolean;
  mod_hotel: boolean;
  mod_seguro: boolean;
  mod_rodoviario: boolean;
  auto_search: boolean;
  auto_payment: boolean;
  quote_validity_minutes: number;
};

const DEFAULTS: PasshubSettingsRow = {
  enabled: false,
  api_key: null,
  mod_aereo: true,
  mod_hotel: true,
  mod_seguro: true,
  mod_rodoviario: false,
  auto_search: false,
  auto_payment: false,
  quote_validity_minutes: QUOTE_DEFAULT_VALIDITY_MIN,
};

export async function loadPasshubSettings(organizationId: string): Promise<PasshubSettingsRow> {
  const { data } = await supabaseAdmin
    .from("passhub_settings")
    .select(
      "enabled,api_key,mod_aereo,mod_hotel,mod_seguro,mod_rodoviario,auto_search,auto_payment,quote_validity_minutes",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? { ...DEFAULTS, ...(data as PasshubSettingsRow) } : { ...DEFAULTS };
}

/** Prazo de pagamento da cotação da organização (padrão 15 min). */
export async function quoteValidityForOrg(organizationId: string): Promise<number> {
  try {
    const s = await loadPasshubSettings(organizationId);
    return clampValidity(s.quote_validity_minutes);
  } catch {
    return QUOTE_DEFAULT_VALIDITY_MIN;
  }
}

export type PasshubSaveInput = {
  enabled: boolean;
  apiKey?: string | null;
  clearApiKey?: boolean;
  modAereo: boolean;
  modHotel: boolean;
  modSeguro: boolean;
  modRodoviario: boolean;
  autoSearch: boolean;
  autoPayment: boolean;
  quoteValidityMinutes: number;
};

export async function savePasshubSettings(
  organizationId: string,
  userId: string,
  input: PasshubSaveInput,
): Promise<void> {
  const current = await loadPasshubSettings(organizationId);
  const newKey = input.apiKey?.trim();
  const api_key = input.clearApiKey ? null : newKey ? newKey : current.api_key;
  const { error } = await supabaseAdmin.from("passhub_settings").upsert(
    {
      organization_id: organizationId,
      enabled: input.enabled,
      api_key,
      mod_aereo: input.modAereo,
      mod_hotel: input.modHotel,
      mod_seguro: input.modSeguro,
      mod_rodoviario: input.modRodoviario,
      auto_search: input.autoSearch,
      auto_payment: input.autoPayment,
      quote_validity_minutes: clampValidity(input.quoteValidityMinutes),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(error.message);
}
