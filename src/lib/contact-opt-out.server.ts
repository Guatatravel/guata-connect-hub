import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyContactDeleted,
  applyDoNotContact,
  clearDoNotContact,
  hasDeclinedInvite,
  parseDoNotContact,
  type DoNotContactReason,
} from "@/lib/contact-opt-out.shared";
async function cancelFollowUpQuiet(sessionId: string) {
  const { clearFollowUp } = await import("@/lib/crm.server");
  await clearFollowUp(sessionId).catch(() => undefined);
}

async function loadIntake(sessionId: string): Promise<{
  organization_id: string | null;
  phone: string;
  intake: Record<string, unknown>;
} | null> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("organization_id, phone, intake_data")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    organization_id: (data.organization_id as string | null) ?? null,
    phone: String(data.phone ?? ""),
    intake: { ...((data.intake_data ?? {}) as Record<string, unknown>) },
  };
}

async function saveIntake(sessionId: string, intake: Record<string, unknown>) {
  await supabaseAdmin
    .from("sessions")
    .update({ intake_data: intake as never })
    .eq("id", sessionId);
}

/** Marca não contatar nesta sessão (e cancela follow-up). */
export async function setDoNotContact(
  sessionId: string,
  reason: DoNotContactReason = "manual",
): Promise<void> {
  const row = await loadIntake(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const intake = applyDoNotContact(row.intake, reason);
  await saveIntake(sessionId, intake);
  await cancelFollowUpQuiet(sessionId);
}

export async function unsetDoNotContact(sessionId: string): Promise<void> {
  const row = await loadIntake(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  await saveIntake(sessionId, clearDoNotContact(row.intake));
}

/** Soft-delete: some do painel, mantém telefone como não contatar (campanha não volta). */
export async function softDeleteContact(sessionId: string): Promise<void> {
  const row = await loadIntake(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const intake = applyContactDeleted(row.intake);
  await cancelFollowUpQuiet(sessionId);
  await supabaseAdmin
    .from("sessions")
    .update({
      intake_data: intake as never,
      archived_at: new Date().toISOString(),
      mode: "humano",
    })
    .eq("id", sessionId);
}

export async function setDoNotContactMany(
  sessionIds: string[],
  reason: DoNotContactReason = "manual",
): Promise<number> {
  let n = 0;
  for (const id of sessionIds.slice(0, 200)) {
    await setDoNotContact(id, reason);
    n += 1;
  }
  return n;
}

export async function softDeleteContactsMany(sessionIds: string[]): Promise<number> {
  let n = 0;
  for (const id of sessionIds.slice(0, 100)) {
    await softDeleteContact(id);
    n += 1;
  }
  return n;
}

/**
 * Quem já tem template_declined_at e ainda não está em do_not_contact
 * → entra na lista (backfill dos recusados antigos).
 */
export async function backfillDeclinedToOptOut(organizationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, intake_data")
    .eq("organization_id", organizationId)
    .limit(800);
  let updated = 0;
  for (const row of data ?? []) {
    const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
    if (!hasDeclinedInvite(intake)) continue;
    if (parseDoNotContact(intake).active) continue;
    await saveIntake(row.id as string, applyDoNotContact(intake, "declined_invite"));
    await cancelFollowUpQuiet(row.id as string);
    updated += 1;
  }
  return updated;
}

/** True se qualquer sessão desse telefone na org está em não contatar. */
export async function phoneIsDoNotContact(organizationId: string, phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("phone, intake_data")
    .eq("organization_id", organizationId)
    .limit(2000);
  for (const row of data ?? []) {
    const p = String(row.phone ?? "").replace(/\D/g, "");
    if (p !== digits && !p.endsWith(digits) && !digits.endsWith(p)) continue;
    if (parseDoNotContact((row.intake_data ?? {}) as Record<string, unknown>).active) {
      return true;
    }
  }
  return false;
}
