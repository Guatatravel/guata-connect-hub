/**
 * Multi-organização (agências) — server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

let cachedGuataOrgId: string | null = null;

export async function getGuataOrganizationId(): Promise<string> {
  if (cachedGuataOrgId) return cachedGuataOrgId;
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", "guata")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Organização Guatá não encontrada. Rode as migrations.");
  cachedGuataOrgId = data.id as string;
  return cachedGuataOrgId;
}

export async function resolveOrganizationForUser(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.organization_id) return data.organization_id as string;
  return getGuataOrganizationId();
}

export async function organizationUsesDescubra(orgId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("use_descubra_kb")
    .eq("id", orgId)
    .maybeSingle();
  return Boolean(data?.use_descubra_kb);
}

export interface WhatsAppChannelRow {
  id: string;
  line: "descubra" | "viagens";
  label: string;
  waba_id: string | null;
  phone_number_id: string | null;
  has_token: boolean;
  is_active: boolean;
}

export async function listWhatsAppChannels(orgId: string): Promise<WhatsAppChannelRow[]> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("id, line, label, waba_id, phone_number_id, access_token, is_active")
    .eq("organization_id", orgId)
    .order("line");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    line: r.line as "descubra" | "viagens",
    label: (r.label as string) ?? "",
    waba_id: (r.waba_id as string) ?? null,
    phone_number_id: (r.phone_number_id as string) ?? null,
    has_token: Boolean(r.access_token),
    is_active: Boolean(r.is_active),
  }));
}

export async function resolveWhatsAppCredentials(
  line: "descubra" | "viagens",
): Promise<{ token?: string; phoneId?: string }> {
  const orgId = await getGuataOrganizationId();
  const { data } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("access_token, phone_number_id")
    .eq("organization_id", orgId)
    .eq("line", line)
    .eq("is_active", true)
    .maybeSingle();

  const token = (data?.access_token as string | undefined)?.trim();
  const phoneId = (data?.phone_number_id as string | undefined)?.trim();
  if (token && phoneId) return { token, phoneId };

  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  return {
    token:
      process.env[`META_ACCESS_TOKEN${suffix}`] ?? process.env["META_ACCESS_TOKEN"],
    phoneId:
      process.env[`META_PHONE_NUMBER_ID${suffix}`] ??
      process.env["META_PHONE_NUMBER_ID"],
  };
}
