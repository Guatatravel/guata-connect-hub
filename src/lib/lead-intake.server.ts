/**
 * Cria triagem (travel_intake) a partir de lead quente — server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LeadStage } from "@/lib/lead-stage.server";

const OPEN_INTAKE = ["aberta", "novo"];

export function parseLeadStageFromIntake(data: Record<string, unknown> | null | undefined): LeadStage {
  const s = data?.["lead_stage"];
  if (s === "qualificando" || s === "quente" || s === "informacional") return s;
  return "informacional";
}

/** Garante uma triagem aberta quando o lead está quente ou passou para humano. */
export async function ensureTravelIntakeForSession(sessionId: string): Promise<string | null> {
  const { data: open } = await supabaseAdmin
    .from("travel_intake")
    .select("id, protocol")
    .eq("session_id", sessionId)
    .in("status", OPEN_INTAKE)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) return open.protocol as string;

  const { data: sess } = await supabaseAdmin
    .from("sessions")
    .select("line, phone, contact_name, dossie, intake_data")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return null;

  const dossie = (sess.dossie ?? {}) as Record<string, unknown>;
  const intake = (sess.intake_data ?? {}) as Record<string, unknown>;
  const pref = (intake.preferencias as Record<string, unknown>) ?? intake;

  const destino =
    String(dossie["destino"] ?? pref["destino"] ?? intake["destino"] ?? "").trim() || "A definir";
  const origem =
    String(dossie["origem"] ?? pref["origem"] ?? intake["origem"] ?? "").trim() || undefined;

  const { data: proto } = await supabaseAdmin.rpc("generate_protocol");
  const protocol = (proto as string) ?? `GV-${Date.now().toString().slice(-6)}`;

  const { error } = await supabaseAdmin.from("travel_intake").insert({
    session_id: sessionId,
    protocol,
    origem: origem ?? null,
    destino,
    preferencias: {
      lead_stage: parseLeadStageFromIntake(intake),
      resumo: dossie["resumo"] ?? dossie["resumo_executivo"] ?? dossie["interesse"] ?? null,
      fonte: "whatsapp_sdr",
    } as never,
    status: "novo",
  });
  if (error) {
    console.error("[lead-intake] insert falhou:", error.message);
    return null;
  }

  return protocol;
}
