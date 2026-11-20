import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireActiveOrganization,
  sessionIdsForOrganization,
} from "@/lib/auth-context.server";

async function requireStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  if (!data || data.length === 0) throw new Error("Acesso restrito.");
}

/**
 * Contadores para os badges da sidebar (escopo da org ativa).
 */
export const fetchUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const orgId = await requireActiveOrganization(context.userId);
    const sessionIds = await sessionIdsForOrganization(orgId);
    if (sessionIds.length === 0) {
      return { triagensAbertas: 0, conversasHumano: 0, organizationId: orgId };
    }

    const [triagensRes, humanoRes] = await Promise.all([
      supabaseAdmin
        .from("travel_intake")
        .select("session_id")
        .in("session_id", sessionIds)
        .in("status", ["aberta", "novo"])
        .is("staff_seen_at", null),
      supabaseAdmin
        .from("sessions")
        .select("id, last_message_at, staff_seen_at, mode")
        .eq("organization_id", orgId),
    ]);
    const triagemSessionIds = new Set((triagensRes.data ?? []).map((r) => r.session_id as string));
    const fila = new Set<string>();
    for (const s of humanoRes.data ?? []) {
      if (s.mode !== "humano") continue;
      if (!s.staff_seen_at || new Date(s.staff_seen_at) < new Date(s.last_message_at as string)) {
        fila.add(s.id as string);
      }
    }
    for (const sid of triagemSessionIds) fila.add(sid);

    return {
      triagensAbertas: 0,
      conversasHumano: fila.size,
      organizationId: orgId,
    };
  });


/** Marca triagens como vistas (uma específica ou todas da org ativa) e zera o badge. */
export const markTriagesSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const orgId = await requireActiveOrganization(context.userId);
    const sessionIds = await sessionIdsForOrganization(orgId);
    if (sessionIds.length === 0) return { ok: true };
    let q = supabaseAdmin
      .from("travel_intake")
      .update({ staff_seen_at: new Date().toISOString() })
      .in("session_id", sessionIds)
      .is("staff_seen_at", null);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
