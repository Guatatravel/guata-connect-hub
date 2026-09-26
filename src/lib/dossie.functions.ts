import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ id: z.string().uuid() });

async function assertStaff(supabase: { rpc: (...a: never[]) => unknown }, userId: string) {
  const { data } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null }>;
  }).rpc("is_staff", { _uid: userId });
  if (!data) throw new Error("Acesso restrito à equipe.");
}

export const getDossie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("sessions")
      .select("dossie, dossie_at" as never)
      .eq("id", data.id)
      .maybeSingle();
    const row = s as unknown as { dossie: unknown; dossie_at: string | null } | null;
    return { dossie: (row?.dossie ?? null) as import("./dossie.server").Dossie | null, at: row?.dossie_at ?? null };
  });

export const regenerateDossie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase as never, context.userId);
    const { generateDossie } = await import("./dossie.server");
    const dossie = await generateDossie(data.id);
    if (!dossie) throw new Error("Ainda não há mensagens nesta conversa.");
    return { dossie, at: new Date().toISOString() };
  });
