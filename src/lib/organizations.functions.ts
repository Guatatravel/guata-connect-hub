import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addOrganizationMember,
  createPartnerOrganization,
  isOrganizationAccessLiberado,
  listOrganizationsForUser,
  listWhatsAppChannels,
  resolveOrganizationForUser,
  setActiveOrganizationForUser,
  userCanManagePartnerOrgs,
  userCanManageOrgWhatsApp,
  userCanManageOrgTeam,
  listOrganizationTeamMembers,
} from "@/lib/organizations.server";

export const fetchMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgs = await listOrganizationsForUser(context.userId);
    const activeId = await resolveOrganizationForUser(context.userId);
    const canManagePartners = await userCanManagePartnerOrgs(context.userId);
    return { organizations: orgs, activeOrganizationId: activeId, canManagePartners };
  });

export const setActiveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await setActiveOrganizationForUser(context.userId, data.organizationId);
    return { ok: true };
  });

const createOrgSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(60),
});

export const createPartnerOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createOrgSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await userCanManagePartnerOrgs(context.userId))) {
      throw new Error("Apenas administradores Guatá podem criar agências parceiras.");
    }
    const id = await createPartnerOrganization(data);
    return { id };
  });

const addMemberSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member"]).optional(),
});

export const addOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addMemberSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (!(await userCanManagePartnerOrgs(context.userId))) {
      throw new Error("Apenas administradores Guatá podem vincular membros.");
    }
    await addOrganizationMember(data.organizationId, data.userId, data.role ?? "member");
    return { ok: true };
  });

export const fetchOrganizationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, is_guata, use_descubra_kb, access_liberado")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) throw new Error("Organização não encontrada.");
    const channels = await listWhatsAppChannels(orgId);
    const hasViagensChannel = channels.some(
      (c) => c.line === "viagens" && Boolean(c.phone_number_id?.trim()),
    );
    const accessLiberado = await isOrganizationAccessLiberado(orgId);
    return {
      organization: {
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        isGuata: Boolean(org.is_guata),
        useDescubraKb: Boolean(org.use_descubra_kb),
        accessLiberado,
      },
      hasViagensChannel,
      channels,
    };
  });

const saveChannelSchema = z.object({
  line: z.enum(["descubra", "viagens"]),
  wabaId: z.string().max(80).optional(),
  phoneNumberId: z.string().max(80).optional(),
  accessToken: z.string().max(8000).optional(),
  label: z.string().max(120).optional(),
});

export const saveWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveChannelSchema.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error(
        "Sem permissão para alterar o WhatsApp desta organização. Peça a um administrador da agência.",
      );
    }
    if (!(await isOrganizationAccessLiberado(orgId))) {
      throw new Error(
        "WhatsApp fica disponível depois que a equipe Guatá liberar sua agência em Solicitações.",
      );
    }
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.wabaId !== undefined) patch.waba_id = data.wabaId.trim() || null;
    if (data.phoneNumberId !== undefined) patch.phone_number_id = data.phoneNumberId.trim() || null;
    if (data.accessToken !== undefined) {
      const t = data.accessToken.trim();
      patch.access_token = t || null;
    }
    if (data.label !== undefined) patch.label = data.label.trim();

    const { error } = await supabaseAdmin
      .from("whatsapp_channels")
      .update(patch as never)
      .eq("organization_id", orgId)
      .eq("line", data.line);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const botAudioSettingsSchema = z.object({
  allowBotAudio: z.boolean(),
  monthlyCap: z.number().int().min(0).max(1_000_000).nullable(),
  clientDefaultOn: z.boolean(),
});

export const fetchOrgBotAudioSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { loadOrgBotAudioSettings } = await import("@/lib/bot-audio-org.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("is_guata")
      .eq("id", orgId)
      .maybeSingle();
    const settings = await loadOrgBotAudioSettings(orgId);
    const canManagePartners = await userCanManagePartnerOrgs(context.userId);
    const isGuata = Boolean(org?.is_guata);
    return {
      ...settings,
      isGuata,
      canEdit: isGuata || canManagePartners,
    };
  });

export const saveOrgBotAudioSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => botAudioSettingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { saveOrgBotAudioSettings: persist } = await import("@/lib/bot-audio-org.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("is_guata")
      .eq("id", orgId)
      .maybeSingle();
    const isGuata = Boolean(org?.is_guata);
    const canManagePartners = await userCanManagePartnerOrgs(context.userId);
    if (!isGuata && !canManagePartners) {
      throw new Error(
        "O add-on de voz é ativado pela equipe Guatá. Entre em contato para contratar o pacote de áudios.",
      );
    }
    await persist(orgId, data);
    return { ok: true };
  });

export const provisionAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Apenas administradores podem liberar solicitações.");

    const { provisionPartnerFromAccessRequest } = await import(
      "@/lib/access-provision.server"
    );
    return provisionPartnerFromAccessRequest(data.requestId);
  });

/** Estado do painel: org ativa, liberação e papéis (layout / menu). */
export const fetchPanelAccessGate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    const orgs = await listOrganizationsForUser(context.userId);
    const activeOrg = orgs.find((o) => o.id === orgId) ?? orgs[0];
    const accessLiberado = await isOrganizationAccessLiberado(orgId);
    const canManagePartners = await userCanManagePartnerOrgs(context.userId);

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const isGlobalAdmin = roleList.includes("admin");
    const canManageOrgTeam =
      (await userCanManageOrgTeam(context.userId, orgId)) &&
      (accessLiberado || isGlobalAdmin);

    return {
      organizationId: orgId,
      organizationName: activeOrg?.name ?? "Agência",
      accessLiberado: accessLiberado || isGlobalAdmin,
      isGlobalAdmin,
      canManagePartners,
      canManageOrgTeam,
      roles: roleList,
    };
  });

const inviteTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

/** Consultor humano com login no painel — vinculado à org ativa. */
export const listOrgTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    if (!(await userCanManageOrgTeam(context.userId, orgId))) {
      throw new Error("Somente o responsável da agência pode gerenciar a equipe.");
    }
    if (!(await isOrganizationAccessLiberado(orgId))) {
      throw new Error("Libere a agência em Solicitações antes de convidar consultores.");
    }
    const members = await listOrganizationTeamMembers(orgId);
    return { organizationId: orgId, members };
  });

export const inviteOrgTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => inviteTeamSchema.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    if (!(await userCanManageOrgTeam(context.userId, orgId))) {
      throw new Error("Somente o responsável da agência pode convidar consultores.");
    }
    if (!(await isOrganizationAccessLiberado(orgId))) {
      throw new Error("Libere a agência antes de convidar consultores.");
    }

    const email = data.email.trim().toLowerCase();
    let userId: string | undefined;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, must_change_password: true },
    });

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (!msg.includes("already") && !msg.includes("registered")) {
        throw new Error(createErr.message);
      }
      const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
      if (listErr) throw new Error(listErr.message);
      const existing = list.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing?.id) throw new Error("E-mail já cadastrado, mas usuário não encontrado.");
      userId = existing.id;
    } else {
      userId = created.user?.id;
    }

    if (!userId) throw new Error("Falha ao criar usuário.");

    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email,
        name: data.name,
        must_change_password: true,
        active_organization_id: orgId,
      },
      { onConflict: "id" },
    );

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!roleRow) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "consultor" });
    }

    const { data: mem } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem) {
      await addOrganizationMember(orgId, userId, "member");
    }

    return { ok: true, userId, email };
  });
