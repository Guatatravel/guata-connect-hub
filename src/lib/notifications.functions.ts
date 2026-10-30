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
        .select("id", { count: "exact", head: true })
        .in("session_id", sessionIds)
        .in("status", ["aberta", "novo"]),
      supabaseAdmin
        .from("sessions")
        .select("last_message_at, staff_seen_at")
        .eq("organization_id", orgId)
        .eq("mode", "humano"),
    ]);
    return {
      triagensAbertas: triagensRes.count ?? 0,
      conversasHumano: (humanoRes.data ?? []).filter(
        (s) => !s.staff_seen_at || new Date(s.staff_seen_at) < new Date(s.last_message_at),
      ).length,
      organizationId: orgId,
    };
  });
