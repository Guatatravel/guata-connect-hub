import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveOrganizationForUser } from "@/lib/organizations.server";
import { patchConversationCrm, runDueFollowUps, setFollowUp } from "@/lib/crm.server";
import { CRM_COLUMNS } from "@/lib/crm.shared";

async function requireStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  if (!data?.length) throw new Error("Acesso restrito.");
}

const columnIds = CRM_COLUMNS.map((c) => c.id) as [string, ...string[]];

export const updateConversationCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        guide: z.string().max(80).nullable().optional(),
        labels: z.array(z.string().max(40)).max(8).optional(),
        column: z.enum(columnIds).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    return patchConversationCrm(data.id, {
      guide: data.guide,
      labels: data.labels,
      column: data.column as (typeof CRM_COLUMNS)[number]["id"] | null | undefined,
      lockGuide: data.guide !== undefined,
    });
  });

export const scheduleFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        days: z.number().int().min(1).max(30),
        text: z.string().min(1).max(1000),
        templateName: z.string().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const followUp = await setFollowUp(data.id, data);
    return { followUp };
  });

export const listQuickReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("quick_replies")
      .select("id, title, body")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) {
      return {
        replies: [] as Array<{ id: string; title: string; body: string }>,
        needsSql: true,
      };
    }
    return { replies: data ?? [], needsSql: false };
  });

export const saveQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ title: z.string().min(1).max(60), body: z.string().min(1).max(1000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const { error } = await supabaseAdmin.from("quick_replies").insert({
      organization_id: orgId,
      title: data.title.trim(),
      body: data.body.trim(),
    });
    if (error) {
      throw new Error(
        "Não consegui salvar. Rode no SQL editor o arquivo supabase/migrations/20261026230000_quick_replies.sql.",
      );
    }
    return { ok: true };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    await supabaseAdmin
      .from("quick_replies")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
    return { ok: true };
  });

export const runFollowUpsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    await runDueFollowUps(orgId);
    return { ok: true };
  });
