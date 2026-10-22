import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  listWhatsAppChannels,
  resolveOrganizationForUser,
} from "@/lib/organizations.server";

async function requireAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem alterar canais WhatsApp.");
}

export const fetchOrganizationContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, is_guata, use_descubra_kb")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) throw new Error("Organização não encontrada.");
    const channels = await listWhatsAppChannels(orgId);
    return {
      organization: {
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        isGuata: Boolean(org.is_guata),
        useDescubraKb: Boolean(org.use_descubra_kb),
      },
      channels,
    };
  });

const saveChannelSchema = z.object({
  line: z.enum(["descubra", "viagens"]),
  wabaId: z.string().max(80).optional(),
  phoneNumberId: z.string().max(80).optional(),
  accessToken: z.string().max(8000).optional(),
  label: z.string().max(120).optional(),
});

export const saveWhatsAppChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => saveChannelSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (data.wabaId !== undefined) patch.waba_id = data.wabaId.trim() || null;
    if (data.phoneNumberId !== undefined) patch.phone_number_id = data.phoneNumberId.trim() || null;
    if (data.accessToken !== undefined) {
      const t = data.accessToken.trim();
      patch.access_token = t || null;
    }
    if (data.label !== undefined) patch.label = data.label.trim();

    const { error } = await supabaseAdmin
      .from("whatsapp_channels")
      .update(patch)
      .eq("organization_id", orgId)
      .eq("line", data.line);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
