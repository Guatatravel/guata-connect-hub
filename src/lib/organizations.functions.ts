import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  addOrganizationMember,
  createPartnerOrganization,
  listOrganizationsForUser,
  listWhatsAppChannels,
  resolveOrganizationForUser,
  setActiveOrganizationForUser,
  userCanManagePartnerOrgs,
} from "@/lib/organizations.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem alterar canais WhatsApp.");
}

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
      .select("id, name, slug, is_guata, use_descubra_kb")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) throw new Error("Organização não encontrada.");
    const channels = await listWhatsAppChannels(orgId);
    const hasViagensChannel = channels.some(
      (c) => c.line === "viagens" && Boolean(c.phone_number_id?.trim()),
    );
    return {
      organization: {
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        isGuata: Boolean(org.is_guata),
        useDescubraKb: Boolean(org.use_descubra_kb),
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
    await requireAdmin(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
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
