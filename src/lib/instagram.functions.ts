import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const fetchInstagramSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadIgSettings } = await import("@/lib/instagram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = await requireActiveOrganization(context.userId);
    const s = await loadIgSettings(orgId);
    const { data: events } = await supabaseAdmin
      .from("instagram_events")
      .select("id,username,text,status,error,created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      enabled: s?.enabled ?? false,
      igAccountId: s?.ig_account_id ?? "",
      hasToken: Boolean(s?.access_token),
      facebookReady: Boolean(process.env['META_APP_ID'] && process.env['META_APP_SECRET'] && process.env['INSTAGRAM_OAUTH_SESSION_SECRET']),
      whatsappNumber: s?.whatsapp_number ?? "",
      keywords: s?.keywords ?? ["quero", "eu quero", "valor", "roteiro", "pacote", "preço"],
      replyAnyQuestion: s?.reply_any_question ?? false,
      commentReplies: s?.comment_replies ?? [
        "Oi @{nome}, te chamei no Direct! ✨",
        "@{nome} acabei de te mandar os detalhes no Direct 😉",
        "Oi @{nome}! Dá uma olhadinha no seu Direct 💚",
      ],
      dmExtra: s?.dm_extra ?? "",
      events: events ?? [],
      canEdit: await userCanManageOrgWhatsApp(context.userId, orgId),
    };
  });

const schema = z.object({
  enabled: z.boolean(),
  igAccountId: z.string().trim().max(60).regex(/^\d*$/, "ID da conta deve ter só números"),
  accessToken: z.string().trim().max(1000).optional().nullable(),
  whatsappNumber: z.string().trim().max(30),
  keywords: z.array(z.string().trim().min(1).max(40)).max(30),
  replyAnyQuestion: z.boolean(),
  commentReplies: z.array(z.string().trim().min(1).max(200)).min(1).max(10),
  dmExtra: z.string().trim().max(600),
});

export const saveInstagramSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => schema.parse(i))
  .handler(async ({ data, context }) => {
    const { requireActiveOrganization } = await import("@/lib/auth-context.server");
    const { userCanManageOrgWhatsApp } = await import("@/lib/organizations.server");
    const { loadIgSettings } = await import("@/lib/instagram.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = await requireActiveOrganization(context.userId);
    if (!(await userCanManageOrgWhatsApp(context.userId, orgId))) {
      throw new Error("Apenas o dono ou administrador da agência pode alterar o Instagram.");
    }
    const cur = await loadIgSettings(orgId);
    const { error } = await supabaseAdmin.from("instagram_settings").upsert(
      {
        organization_id: orgId,
        enabled: data.enabled,
        ig_account_id: data.igAccountId || null,
        access_token: data.accessToken?.trim() || cur?.access_token || null,
        whatsapp_number: data.whatsappNumber.replace(/\D/g, "") || null,
        keywords: data.keywords,
        reply_any_question: data.replyAnyQuestion,
        comment_replies: data.commentReplies,
        dm_extra: data.dmExtra || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
