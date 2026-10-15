import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const audienceSchema = z.enum([
  "active_24h",
  "active_7d",
  "active_30d",
  "all_sessions",
]);
const lineSchema = z.enum(["descubra", "viagens"]);

const createSchema = z.object({
  title: z.string().min(2).max(160),
  line: lineSchema,
  body: z.string().max(4000),
  audience: audienceSchema,
  imageBase64: z.string().optional(),
  imageContentType: z.string().optional(),
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
    const count = await previewAudienceCount(data.line, data.audience);
    return { count };
  });

export const createCampaignFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => createSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { createCampaignDraft } = await import("@/lib/campaigns.server");
    await requireStaffUser(context.userId);
    if (!data.body.trim() && !data.imageBase64) {
      throw new Error("Informe o texto ou anexe um cartaz.");
    }
    return createCampaignDraft(context.userId, data);
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
