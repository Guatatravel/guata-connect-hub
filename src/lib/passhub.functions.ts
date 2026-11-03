import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PasshubSettingsView } from "@/lib/passhub.shared";

export const fetchPasshubSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PasshubSettingsView> => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadPasshubSettings } = await import("@/lib/passhub.server");
    const orgId = await requireActiveOrganization(context.userId);
    const s = await loadPasshubSettings(orgId);
    const key = s.api_key ?? "";
    return {
      enabled: s.enabled,
      hasApiKey: key.length > 0,
      apiKeyHint: key.length > 4 ? `••••${key.slice(-4)}` : key ? "••••" : null,
      modAereo: s.mod_aereo,
      modHotel: s.mod_hotel,
      modSeguro: s.mod_seguro,
      modRodoviario: s.mod_rodoviario,
      autoSearch: s.auto_search,
      autoPayment: s.auto_payment,
      quoteValidityMinutes: s.quote_validity_minutes,
      canEdit: await userCanManageOrgWhatsApp(context.userId, orgId),
    };
  });

const saveSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().max(500).optional().nullable(),
  clearApiKey: z.boolean().optional(),
  modAereo: z.boolean(),
  modHotel: z.boolean(),
  modSeguro: z.boolean(),
  modRodoviario: z.boolean(),
  autoSearch: z.boolean(),
  autoPayment: z.boolean(),
  quoteValidityMinutes: z.number().int().min(5).max(120),
});

export const savePasshubSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { savePasshubSettings: persist } = await import("@/lib/passhub.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador da agência pode alterar o Passhub.");
    }
    await persist(orgId, context.userId, data);
    return { ok: true };
  });

/** Prazo de pagamento da cotação (para o gerador de cotação da conversa). */
export const fetchQuoteValidity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { quoteValidityForOrg } = await import("@/lib/passhub.server");
    const orgId = await requireActiveOrganization(context.userId);
    return { minutes: await quoteValidityForOrg(orgId) };
  });
