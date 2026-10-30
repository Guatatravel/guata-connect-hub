import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdminUser } from "@/lib/diagnostics.server";

export const deleteAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({
    id: String(input?.id ?? ""),
  }))
  .handler(async ({ data, context }) => {
    await requireAdminUser(context.userId);
    if (!data.id) throw new Error("Solicitação inválida.");
    const { error } = await supabaseAdmin.from("access_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
