import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskKey, PASSHUB_PRODUCTS, type PasshubSettingsView } from "@/lib/passhub.shared";

export const fetchPasshubSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PasshubSettingsView> => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadPasshubSettings } = await import("@/lib/passhub.server");
    const orgId = await requireActiveOrganization(context.userId);
    const s = await loadPasshubSettings(orgId);
    const products = Object.fromEntries(
      PASSHUB_PRODUCTS.map((p) => {
        const key = s[`api_key_${p}`];
        return [p, { enabled: s[`mod_${p}`], hasKey: Boolean(key?.trim()), keyHint: maskKey(key) }];
      }),
    ) as PasshubSettingsView["products"];
    return {
      enabled: s.enabled,
      products,
      autoSearch: s.auto_search,
      autoPayment: s.auto_payment,
      quoteValidityMinutes: s.quote_validity_minutes,
      agencyContactEmail: s.agency_contact_email ?? "",
      agencyContactPhone: s.agency_contact_phone ?? "",
      canEdit: await userCanManageOrgWhatsApp(context.userId, orgId),
    };
  });

const productSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().max(500).optional().nullable(),
  clearKey: z.boolean().optional(),
});

const saveSchema = z.object({
  enabled: z.boolean(),
  products: z.object({
    aereo: productSchema,
    hotel: productSchema,
    seguro: productSchema,
    rodoviario: productSchema,
  }),
  autoSearch: z.boolean(),
  autoPayment: z.boolean(),
  quoteValidityMinutes: z.number().int().min(5).max(120),
  agencyContactEmail: z.union([z.literal(""), z.string().trim().email().max(200)]).optional().nullable(),
  agencyContactPhone: z.string().trim().max(40).optional().nullable(),
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
