import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const audienceSchema = z.enum([
  "active_24h",
  "active_7d",
  "active_30d",
  "all_sessions",
]);
const lineSchema = z.enum(["descubra", "viagens", "both"]);

const createSchema = z.object({
  title: z.string().min(2).max(160),
  line: lineSchema,
  body: z.string().max(4000),
  audience: audienceSchema,
  imageBase64: z.string().optional(),
  imageContentType: z.string().optional(),
  sendMode: z.enum(["sessao", "template"]).optional(),
  templateName: z.string().max(512).optional(),
  templateLanguage: z.string().max(16).optional(),
  templateUsesName: z.boolean().optional(),
  extraPhones: z.string().max(4000).optional(),
});

export const listCampaignsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { listCampaigns } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return listCampaigns();
  });

export const previewCampaignAudienceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ line: lineSchema, audience: audienceSchema }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { previewAudienceCount } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return previewAudienceCount(data.line, data.audience);
  });

export const campaignMetaStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { getCampaignMetaStatus } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return await getCampaignMetaStatus();
  });

export const createAndLaunchCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { createAndLaunchCampaigns } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    if (data.sendMode === "template" && !data.templateName?.trim()) {
      throw new Error("Informe o nome do template aprovado na Meta (WhatsApp Manager).");
    }
    if (data.sendMode !== "template" && !data.body.trim() && !data.imageBase64) {
      throw new Error("Informe o texto ou anexe um cartaz.");
    }
    return createAndLaunchCampaigns(context.userId, data);
  });

export const launchCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { launchCampaign } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return launchCampaign(data.id);
  });

export const saveCampaignDraftFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    createSchema.extend({ id: z.string().uuid().optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { saveCampaignDraft } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return saveCampaignDraft(context.userId, data);
  });

export const deleteCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { deleteCampaign } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    await deleteCampaign(data.id);
    return { ok: true };
  });

export const duplicateAndLaunchCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { duplicateAndLaunchCampaign } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    return duplicateAndLaunchCampaign(context.userId, data.id);
  });
