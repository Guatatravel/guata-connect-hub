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
    const { resolveOrganizationForUser, userCanManageOrgWhatsApp } = await import("./organizations.server");
    const { readEmbeddedSignupState } = await import("./whatsapp-embedded.server");
    const { connectionForViewer } = await import("./whatsapp-embedded.shared");
    const orgId = await resolveOrganizationForUser(context.userId);
    const canManage = await userCanManageOrgWhatsApp(context.userId, orgId);
    const state = await readEmbeddedSignupState(orgId);
    if (canManage) return { ...state, canManage: true };
    return {
      appId: "",
      configId: "",
      ready: false,
      canManage: false,
      connection: connectionForViewer(state.connection, false),
    };
  });

export const completeWhatsAppEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => signupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { completeEmbeddedSignup } = await import("./whatsapp-embedded.server");
    const orgId = await authorizedOrganization(context.userId);
    return completeEmbeddedSignup(orgId, data);
  });

/** Só reinscreve webhook (ecoo do celular) na WABA já conectada. */
export const resubscribeWhatsAppCoexistenceForOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resubscribeCoexistenceWebhooksForOrg } = await import("./whatsapp-embedded.server");
    const orgId = await authorizedOrganization(context.userId);
    return resubscribeCoexistenceWebhooksForOrg(orgId);
  });

export const fetchCoexistenceHistoryStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { resolveOrganizationForUser } = await import("./organizations.server");
    const { getCoexistenceHistoryStatusForOrg } = await import("./whatsapp-coexistence-sync.server");
    const orgId = await resolveOrganizationForUser(context.userId);
    return getCoexistenceHistoryStatusForOrg(orgId);
  });

export const requestCoexistenceHistorySync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requestCoexistenceHistorySyncForOrg, getCoexistenceHistoryStatusForOrg } = await import(
      "./whatsapp-coexistence-sync.server"
    );
    const orgId = await authorizedOrganization(context.userId);
    const prior = await getCoexistenceHistoryStatusForOrg(orgId);
    if (!prior.canRequestSync) {
      throw new Error(prior.hint || "Não é possível importar o histórico agora.");
    }
    const result = await requestCoexistenceHistorySyncForOrg(orgId);
    const next = await getCoexistenceHistoryStatusForOrg(orgId);
    return {
      ...result,
      status: next,
      message: result.alreadyRequested
        ? "O pedido de histórico já tinha sido enviado. Aguarde os webhooks da Meta."
        : "Pedido enviado à Meta. Aceite compartilhar o histórico no WhatsApp Business e mantenha o app aberto.",
    };
  });
