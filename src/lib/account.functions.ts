import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const disconnectWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { disconnectOrganizationWhatsApp } = await import("@/lib/account.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador da agência pode desconectar o WhatsApp.");
    }
    return disconnectOrganizationWhatsApp(orgId);
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ confirm: z.literal("EXCLUIR") }).parse(i))
  .handler(async ({ context }) => {
    const { deleteUserAccount } = await import("@/lib/account.server");
    return deleteUserAccount(context.userId);
  });
