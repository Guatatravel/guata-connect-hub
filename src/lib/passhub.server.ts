/**
 * Configuração do Passhub por organização — server-only.
 * As chaves da API (uma por produto) nunca saem do servidor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clampValidity, QUOTE_DEFAULT_VALIDITY_MIN } from "@/lib/quote-format";
import { PASSHUB_PRODUCTS, type PasshubProduct } from "@/lib/passhub.shared";

export type PasshubSettingsRow = {
  enabled: boolean;
  mod_aereo: boolean;
  mod_hotel: boolean;
  mod_seguro: boolean;
  mod_rodoviario: boolean;
  api_key_aereo: string | null;
  api_key_hotel: string | null;
  api_key_seguro: string | null;
  api_key_rodoviario: string | null;
  auto_search: boolean;
  auto_payment: boolean;
  quote_validity_minutes: number;
  agency_contact_email: string | null;
  agency_contact_phone: string | null;
};

const DEFAULTS: PasshubSettingsRow = {
  enabled: false,
  mod_aereo: true,
  mod_hotel: true,
  mod_seguro: true,
  mod_rodoviario: false,
  api_key_aereo: null,
  api_key_hotel: null,
  api_key_seguro: null,
  api_key_rodoviario: null,
  auto_search: false,
  auto_payment: false,
  quote_validity_minutes: QUOTE_DEFAULT_VALIDITY_MIN,
  agency_contact_email: null,
  agency_contact_phone: null,
};

const COLUMNS =
  "enabled,mod_aereo,mod_hotel,mod_seguro,mod_rodoviario,api_key_aereo,api_key_hotel,api_key_seguro,api_key_rodoviario,auto_search,auto_payment,quote_validity_minutes,agency_contact_email,agency_contact_phone";

export async function loadPasshubSettings(organizationId: string): Promise<PasshubSettingsRow> {
  const { data } = await supabaseAdmin
    .from("passhub_settings")
    .select(COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? { ...DEFAULTS, ...(data as Partial<PasshubSettingsRow>) } : { ...DEFAULTS };
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

/** Produtos que o Guatá pode usar: Passhub ligado + produto ligado + chave salva. */
export function activePasshubProducts(s: PasshubSettingsRow): PasshubProduct[] {
  if (!s.enabled) return [];
  return PASSHUB_PRODUCTS.filter((p) => s[`mod_${p}`] && Boolean(s[`api_key_${p}`]?.trim()));
}

export type PasshubProductInput = {
  enabled: boolean;
  apiKey?: string | null;
  clearKey?: boolean;
};

export type PasshubSaveInput = {
  enabled: boolean;
  products: Record<PasshubProduct, PasshubProductInput>;
  autoSearch: boolean;
  autoPayment: boolean;
  quoteValidityMinutes: number;
  agencyContactEmail?: string | null;
  agencyContactPhone?: string | null;
};

function nextKey(current: string | null, input: PasshubProductInput): string | null {
  if (input.clearKey) return null;
  const k = input.apiKey?.trim();
  return k ? k : current;
}

export async function savePasshubSettings(
  organizationId: string,
  userId: string,
  input: PasshubSaveInput,
): Promise<void> {
  const current = await loadPasshubSettings(organizationId);
  const p = input.products;
  const { error } = await supabaseAdmin.from("passhub_settings").upsert(
    {
      organization_id: organizationId,
      enabled: input.enabled,
      mod_aereo: p.aereo.enabled,
      mod_hotel: p.hotel.enabled,
      mod_seguro: p.seguro.enabled,
      mod_rodoviario: p.rodoviario.enabled,
      api_key_aereo: nextKey(current.api_key_aereo, p.aereo),
      api_key_hotel: nextKey(current.api_key_hotel, p.hotel),
      api_key_seguro: nextKey(current.api_key_seguro, p.seguro),
      api_key_rodoviario: nextKey(current.api_key_rodoviario, p.rodoviario),
      auto_search: input.autoSearch,
      auto_payment: input.autoPayment,
      quote_validity_minutes: clampValidity(input.quoteValidityMinutes),
      agency_contact_email: input.agencyContactEmail?.trim() || null,
      agency_contact_phone: input.agencyContactPhone?.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  if (error) throw new Error(error.message);
}
