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

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  isGuata: boolean;
  useDescubraKb: boolean;
}

async function isMember(userId: string, organizationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return Boolean(data);
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("organization_members")
    .select("organization_id, organizations(id, name, slug, is_guata, use_descubra_kb)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const out: OrganizationSummary[] = [];
  for (const row of data ?? []) {
    const org = row.organizations as Record<string, unknown> | null;
    if (!org?.id) continue;
    out.push({
      id: org.id as string,
      name: org.name as string,
      slug: org.slug as string,
      isGuata: Boolean(org.is_guata),
      useDescubraKb: Boolean(org.use_descubra_kb),
    });
  }
  return out;
}

export async function setActiveOrganizationForUser(
  userId: string,
  organizationId: string,
): Promise<void> {
  if (!(await isMember(userId, organizationId))) {
    throw new Error("Você não pertence a esta organização.");
  }
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ active_organization_id: organizationId })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function resolveOrganizationForUser(userId: string): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("active_organization_id")
    .eq("id", userId)
    .maybeSingle();

  const active = profile?.active_organization_id as string | undefined;
  if (active && (await isMember(userId, active))) return active;

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

/** Admin global ou owner/admin da organização ativa podem configurar WhatsApp. */
export async function userCanManageOrgWhatsApp(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: globalAdmin } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (globalAdmin) return true;

  const { data: mem } = await supabaseAdmin
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const role = String(mem?.role ?? "");
  return role === "owner" || role === "admin";
}

export async function userCanManagePartnerOrgs(userId: string): Promise<boolean> {
  const guataId = await getGuataOrganizationId();
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return false;
  return isMember(userId, guataId);
}

export async function createPartnerOrganization(input: {
  name: string;
  slug: string;
}): Promise<string> {
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!slug || slug === "guata") throw new Error("Slug inválido.");
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: input.name.trim(),
      slug,
      is_guata: false,
      use_descubra_kb: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const orgId = org.id as string;
  await supabaseAdmin.from("whatsapp_channels").insert({
    organization_id: orgId,
    line: "descubra",
    label: "WhatsApp comercial",
  });
  return orgId;
}

export async function addOrganizationMember(
  organizationId: string,
  userId: string,
  role: "owner" | "admin" | "member" = "member",
): Promise<void> {
  const { error } = await supabaseAdmin.from("organization_members").insert({
    organization_id: organizationId,
    user_id: userId,
    role,
  });
  if (error) throw new Error(error.message);
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

export interface ResolvedWhatsAppChannel {
  organizationId: string;
  line: "descubra" | "viagens";
}

export async function resolveChannelByPhoneNumberId(
  phoneNumberId: string,
): Promise<ResolvedWhatsAppChannel | null> {
  const id = phoneNumberId.trim();
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("organization_id, line")
    .eq("phone_number_id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (!data?.organization_id) return null;
  return {
    organizationId: data.organization_id as string,
    line: data.line as "descubra" | "viagens",
  };
}

/** Fallback legado: env Guatá quando o número não está no banco. */
export function legacyLineFromEnvPhoneId(phoneId: string): "descubra" | "viagens" {
  const viagens = process.env.META_PHONE_NUMBER_ID_VIAGENS;
  if (viagens && phoneId === viagens) return "viagens";
  return "descubra";
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
  organizationId: string,
  line: "descubra" | "viagens",
): Promise<{ token?: string; phoneId?: string }> {
  const { data } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("access_token, phone_number_id")
    .eq("organization_id", organizationId)
    .eq("line", line)
    .eq("is_active", true)
    .maybeSingle();

  const token = (data?.access_token as string | undefined)?.trim();
  const phoneId = (data?.phone_number_id as string | undefined)?.trim();
  if (token && phoneId) return { token, phoneId };

  const guataId = await getGuataOrganizationId();
  if (organizationId !== guataId) {
    return {};
  }

  const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
  return {
    token:
      process.env[`META_ACCESS_TOKEN${suffix}`] ?? process.env["META_ACCESS_TOKEN"],
    phoneId:
      process.env[`META_PHONE_NUMBER_ID${suffix}`] ??
      process.env["META_PHONE_NUMBER_ID"],
  };
}
