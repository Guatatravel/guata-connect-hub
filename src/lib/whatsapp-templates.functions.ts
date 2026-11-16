import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listWhatsappTemplatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { listWhatsappTemplates } = await import("@/lib/whatsapp-templates.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador pode ver modelos WhatsApp.");
    }
    return listWhatsappTemplates(orgId);
  });

export const syncWhatsappTemplatesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { syncWhatsappTemplatesFromMeta } = await import("@/lib/whatsapp-templates.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Sem permissão para sincronizar modelos.");
    }
    const count = await syncWhatsappTemplatesFromMeta(orgId);
    return { count };
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(512),
  language: z.string().trim().min(2).max(12).default("pt_BR"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  bodyText: z.string().trim().min(1).max(1024),
  headerText: z.string().trim().max(60).optional(),
});

export const createWhatsappTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { createWhatsappTemplate } = await import("@/lib/whatsapp-templates.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Sem permissão para criar modelos.");
    }
    await createWhatsappTemplate(orgId, data);
    return { ok: true };
  });