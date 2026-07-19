import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  if (!data || data.length === 0) throw new Error("Acesso restrito.");
}

/**
 * Contadores para os badges da sidebar.
 *   - triagensAbertas: travel_intake com status 'aberta' ou 'novo' (aguardando consultor)
 *   - conversasHumano: sessions em modo 'humano' (cliente pediu atendente)
 */
export const fetchUnreadCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const [triagensRes, humanoRes] = await Promise.all([
      supabaseAdmin
        .from("travel_intake")
        .select("id", { count: "exact", head: true })
        .in("status", ["aberta", "novo"]),
      supabaseAdmin
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("mode", "humano"),
    ]);
    return {
      triagensAbertas: triagensRes.count ?? 0,
      conversasHumano: humanoRes.count ?? 0,
    };
  });