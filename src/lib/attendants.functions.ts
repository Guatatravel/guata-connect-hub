import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AttendantInput {
  id?: string;
  nome: string;
  line: "descubra" | "viagens";
  persona: string;
  tom: string;
  saudacao: string;
  despedida: string;
  palavras_humano: string[];
  usa_base_local: boolean;
  usa_base_descubra: boolean;
  criatividade: number;
  ativo: boolean;
}

function sanitize(input: AttendantInput): AttendantInput {
  return {
    id: input?.id ? String(input.id) : undefined,
    nome: String(input?.nome ?? "").slice(0, 120),
    line: input?.line === "viagens" ? "viagens" : "descubra",
    persona: String(input?.persona ?? "").slice(0, 4000),
    tom: String(input?.tom ?? "cordial").slice(0, 40),
    saudacao: String(input?.saudacao ?? "").slice(0, 1000),
    despedida: String(input?.despedida ?? "").slice(0, 1000),
    palavras_humano: Array.isArray(input?.palavras_humano)
      ? input.palavras_humano.map((w) => String(w).slice(0, 40)).slice(0, 30)
      : [],
    usa_base_local: Boolean(input?.usa_base_local),
    usa_base_descubra: Boolean(input?.usa_base_descubra),
    criatividade: Math.min(1, Math.max(0, Number(input?.criatividade ?? 0.6))),
    ativo: Boolean(input?.ativo),
  };
}

export const listAttendants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireStaffUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("attendants")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAttendant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AttendantInput) => sanitize(input))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireStaffUser(context.userId);
    if (!data.nome) throw new Error("Informe o nome do atendente");
    const { id, ...fields } = data;
    if (id) {
      const { error } = await supabaseAdmin.from("attendants").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("attendants").insert(fields);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeAttendant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireStaffUser(context.userId);
    const { error } = await supabaseAdmin.from("attendants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
