import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AiQuotaNotice } from "@/lib/ai-quota.server";

export const fetchAiQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiQuotaNotice> => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadAiQuotaNotice } = await import("@/lib/ai-quota.server");
    const orgId = await requireActiveOrganization(context.userId);
    const canEdit = await userCanManageOrgWhatsApp(context.userId, orgId);
    return loadAiQuotaNotice(orgId, canEdit);
  });

const saveSchema = z.object({
  useOwnKey: z.boolean(),
  apiKey: z.string().max(500).optional().nullable(),
  clearKey: z.boolean().optional(),
  replyCap: z.number().int().min(0).max(1_000_000).nullable().optional(),
  aiProvider: z.enum(["auto", "gemini", "lovable"]).optional(),
});

export const saveAiQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { getGuataOrganizationId } = await import("@/lib/organizations.server");
    const { saveAiQuotaSettings } = await import("@/lib/ai-quota.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador pode alterar a inteligência.");
    }
    const canSetCap = orgId === (await getGuataOrganizationId());
    await saveAiQuotaSettings(orgId, data, canSetCap);
    return { ok: true };
  });
