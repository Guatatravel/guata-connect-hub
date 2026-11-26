import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const fetchOrgTts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadOrgTtsNotice } = await import("@/lib/org-tts.server");
    const orgId = await requireActiveOrganization(context.userId);
    const canEdit = await userCanManageOrgWhatsApp(context.userId, orgId);
    return loadOrgTtsNotice(orgId, canEdit);
  });

const saveSchema = z.object({
  useOwnElevenlabs: z.boolean(),
  apiKey: z.string().max(500).optional().nullable(),
  clearKey: z.boolean().optional(),
  voiceMaleId: z.string().max(120).optional().nullable(),
  voiceFemaleId: z.string().max(120).optional().nullable(),
});

export const saveOrgTts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { saveOrgElevenLabsSettings } = await import("@/lib/org-tts.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador pode alterar a voz do BOT.");
    }
    await saveOrgElevenLabsSettings(orgId, data);
    return { ok: true };
  });
