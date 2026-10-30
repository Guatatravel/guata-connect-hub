/**
 * Contexto de autorização multi-organização — server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensurePlatformAdminGuataMembership,
  getGuataOrganizationId,
  isOrganizationAccessLiberado,
  listOrganizationsForUser,
  type OrganizationSummary,
} from "@/lib/organizations.server";

export interface PanelAuthContext {
  userId: string;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  hasOrganization: boolean;
  isPlatformAdmin: boolean;
  canManagePartners: boolean;
  accessLiberado: boolean;
  organizationName: string | null;
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

/** Resolve org ativa sem lançar erro (gate / layout). */
export async function resolveActiveOrganizationId(userId: string): Promise<string | null> {
  const orgs = await listOrganizationsForUser(userId);
  if (orgs.length === 0) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("active_organization_id")
    .eq("id", userId)
    .maybeSingle();

  const active = profile?.active_organization_id as string | undefined;
  if (active && (await isMember(userId, active))) return active;
  return orgs[0]!.id;
}

export async function getPanelAuthContext(userId: string): Promise<PanelAuthContext> {
  await ensurePlatformAdminGuataMembership(userId);

  const organizations = await listOrganizationsForUser(userId);
  const activeOrganizationId = await resolveActiveOrganizationId(userId);
  const hasOrganization = organizations.length > 0;

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const isPlatformAdmin = roleList.includes("admin");

  let canManagePartners = false;
  if (isPlatformAdmin) {
    try {
      const guataId = await getGuataOrganizationId();
      canManagePartners = await isMember(userId, guataId);
    } catch {
      canManagePartners = false;
    }
  }

  const activeOrg = activeOrganizationId
    ? organizations.find((o) => o.id === activeOrganizationId)
    : undefined;

  let accessLiberado = false;
  if (activeOrganizationId) {
    accessLiberado = await isOrganizationAccessLiberado(activeOrganizationId);
  }

  if (isPlatformAdmin) accessLiberado = true;

  return {
    userId,
    organizations,
    activeOrganizationId,
    hasOrganization,
    isPlatformAdmin,
    canManagePartners,
    accessLiberado,
    organizationName: activeOrg?.name ?? null,
  };
}

/** Operações do painel exigem vínculo com agência (admin plataforma incluído se membro). */
export async function requireActiveOrganization(userId: string): Promise<string> {
  await ensurePlatformAdminGuataMembership(userId);
  const orgId = await resolveActiveOrganizationId(userId);
  if (!orgId) {
    throw new Error(
      "Sua conta não está vinculada a nenhuma agência. Peça suporte à equipe Guatá.",
    );
  }
  return orgId;
}

export async function assertUserCanAccessOrganization(
  userId: string,
  organizationId: string,
): Promise<void> {
  const ctx = await getPanelAuthContext(userId);
  if (ctx.canManagePartners) return;
  if (!(await isMember(userId, organizationId))) {
    throw new Error("Você não tem acesso a esta organização.");
  }
}

export async function assertSessionBelongsToUserOrg(
  userId: string,
  sessionId: string,
): Promise<{ organizationId: string; line: "descubra" | "viagens" }> {
  const { data: s } = await supabaseAdmin
    .from("sessions")
    .select("organization_id, line")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s?.organization_id) throw new Error("Sessão não encontrada.");
  await assertUserCanAccessOrganization(userId, s.organization_id as string);
  return {
    organizationId: s.organization_id as string,
    line: s.line as "descubra" | "viagens",
  };
}

/** IDs de sessão da org ativa (triagens / filtros). */
export async function sessionIdsForOrganization(orgId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", orgId)
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id as string);
}
