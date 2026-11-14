import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const signupSchema = z.object({
  code: z.string().trim().min(8).max(4096),
  wabaId: z.string().trim().regex(/^\d{5,32}$/).optional(),
  phoneNumberId: z.string().trim().regex(/^\d{5,32}$/).optional(),
});

async function authorizedOrganization(userId: string): Promise<string> {
  const { resolveOrganizationForUser, userCanManageOrgWhatsApp, isOrganizationAccessLiberado } =
    await import("./organizations.server");
  const orgId = await resolveOrganizationForUser(userId);
  if (!(await userCanManageOrgWhatsApp(userId, orgId))) {
    throw new Error("Sem permissão para alterar o WhatsApp desta organização. Peça a um administrador da agência.");
  }
  if (!(await isOrganizationAccessLiberado(orgId))) {
    throw new Error("WhatsApp fica disponível depois que a equipe Guatá liberar sua agência em Solicitações.");
  }
  return orgId;
}

export const fetchWhatsAppEmbeddedState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveOrganizationForUser } = await import("./organizations.server");
    const { readEmbeddedSignupState } = await import("./whatsapp-embedded.server");
    const orgId = await resolveOrganizationForUser(context.userId);
    return readEmbeddedSignupState(orgId);
  });

export const completeWhatsAppEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => signupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { completeEmbeddedSignup } = await import("./whatsapp-embedded.server");
    const orgId = await authorizedOrganization(context.userId);
    return completeEmbeddedSignup(orgId, data);
  });
