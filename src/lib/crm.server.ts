import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/meta-send.server";
import {
  parseCrm,
  suggestCrm,
  type ConversationCrm,
  type CrmColumnId,
  type FollowUpState,
} from "@/lib/crm.shared";

type SessionCrmRow = {
  id: string;
  phone: string;
  line: "descubra" | "viagens";
  organization_id: string | null;
  intake_data: Record<string, unknown> | null;
};

async function loadSession(sessionId: string): Promise<SessionCrmRow | null> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, phone, line, organization_id, intake_data")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as SessionCrmRow | null) ?? null;
}

async function saveIntake(sessionId: string, intake: Record<string, unknown>) {
  await supabaseAdmin
    .from("sessions")
    .update({ intake_data: intake as never })
    .eq("id", sessionId);
}

export async function patchConversationCrm(
  sessionId: string,
  patch: {
    guide?: string | null;
    labels?: string[];
    column?: CrmColumnId | null;
    lockGuide?: boolean;
  },
): Promise<ConversationCrm> {
  const row = await loadSession(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  if (patch.guide !== undefined) {
    const guide = patch.guide?.trim() ?? "";
    if (guide) intake.crm_guide = guide.slice(0, 80);
    else delete intake.crm_guide;
    if (patch.lockGuide) intake.crm_guide_locked = true;
  }
  if (patch.labels) {
    intake.crm_labels = patch.labels.map((x) => x.trim()).filter(Boolean).slice(0, 8);
  }
  if (patch.column !== undefined) {
    if (patch.column) intake.crm_column = patch.column;
    else delete intake.crm_column;
  }
  await saveIntake(sessionId, intake);
  return parseCrm(intake);
}

/** Preenche guia e coluna vazias quando o cliente escreve. Não troca o que a equipe já marcou. */
export async function applyInboundCrm(sessionId: string, text: string) {
  const row = await loadSession(sessionId);
  if (!row) return;
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  const current = parseCrm(intake);
  const suggestion = suggestCrm(text);
  let changed = false;
  if (suggestion.guide && !current.guide && !current.guideLocked) {
    intake.crm_guide = suggestion.guide;
    changed = true;
  }
  if (suggestion.column && !current.column) {
    intake.crm_column = suggestion.column;
    changed = true;
  }
  const pending = current.followUp?.status === "pending";
  if (pending) {
    intake.follow_up = {
      ...current.followUp,
      status: "skipped",
      detail: "O cliente respondeu antes do follow-up.",
    };
    changed = true;
  }
  if (changed) await saveIntake(sessionId, intake);
}

export async function markQuoteSent(sessionId: string) {
  const row = await loadSession(sessionId);
  if (!row) return;
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  const current = parseCrm(intake);
  if (current.column === "fechado") return;
  intake.crm_column = "orcamento";
  const labels = new Set(current.labels);
  labels.add("Orçamento enviado");
  intake.crm_labels = [...labels];
  await saveIntake(sessionId, intake);
}

export async function setFollowUp(
  sessionId: string,
  input: { days: number; text: string; templateName?: string },
): Promise<FollowUpState> {
  const row = await loadSession(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const text = input.text.trim();
  if (!text) throw new Error("Escreva o texto do follow-up.");
  const days = Math.min(30, Math.max(1, input.days));
  const followUp: FollowUpState = {
    dueAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    text: text.slice(0, 1000),
    templateName: input.templateName?.trim() || undefined,
    status: "pending",
  };
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>), follow_up: followUp };
  await saveIntake(sessionId, intake);
  return followUp;
}

async function windowOpen(sessionId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("created_at")
    .eq("session_id", sessionId)
    .eq("author", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.created_at) return false;
  return Date.now() - new Date(data.created_at).getTime() < 24 * 60 * 60 * 1000;
}

/** Envia follow-ups vencidos desta agência. Chamado ao abrir o painel e ao receber mensagem. */
export async function runDueFollowUps(orgId: string) {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, phone, line, organization_id, intake_data")
    .eq("organization_id", orgId)
    .order("last_message_at", { ascending: false })
    .limit(200);
  const now = Date.now();
  let sent = 0;
  for (const row of (data ?? []) as SessionCrmRow[]) {
    if (sent >= 8) break;
    const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
    const follow = parseCrm(intake).followUp;
    if (!follow || follow.status !== "pending") continue;
    if (new Date(follow.dueAt).getTime() > now) continue;
    const org = row.organization_id;
    if (!org) continue;
    const open = await windowOpen(row.id);
    let next: FollowUpState = follow;
    if (open) {
      const res = await sendWhatsAppText(
        { organizationId: org, line: row.line },
        row.phone,
        follow.text,
      );
      if (res.ok) {
        next = { ...follow, status: "sent", detail: "Enviado na janela de 24 horas." };
        await supabaseAdmin.from("messages").insert({
          session_id: row.id,
          direction: "out",
          author: "agent",
          text: follow.text,
          metadata: {
            follow_up: true,
            wa_message_id: res.messageId,
            delivery_status: "sent",
          } as never,
        });
        sent += 1;
      } else {
        next = {
          ...follow,
          dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          detail: res.reason ?? "Falha no envio. Nova tentativa em 1 hora.",
        };
      }
    } else if (follow.templateName) {
      const res = await sendWhatsAppTemplate(
        { organizationId: org, line: row.line },
        row.phone,
        { name: follow.templateName, bodyParams: [] },
      );
      if (res.ok) {
        next = { ...follow, status: "sent", detail: "Enviado como modelo aprovado, fora das 24 horas." };
        await supabaseAdmin.from("messages").insert({
          session_id: row.id,
          direction: "out",
          author: "agent",
          text: `[modelo ${follow.templateName}] ${follow.text}`,
          metadata: {
            follow_up: true,
            wa_message_id: res.messageId,
            delivery_status: "sent",
          } as never,
        });
        sent += 1;
      } else {
        next = {
          ...follow,
          status: "skipped",
          detail: res.reason ?? "A Meta não aceitou o modelo.",
        };
      }
    } else {
      next = {
        ...follow,
        status: "skipped",
        detail: "Passou de 24 horas e não havia nome de modelo aprovado.",
      };
    }
    intake.follow_up = next;
    await saveIntake(row.id, intake);
    if (next.status === "sent") {
      await supabaseAdmin
        .from("sessions")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
}

/** Mensagem que a equipe enviou pelo aplicativo do celular, espelhada no painel. */
export async function persistPhoneEcho(input: {
  organizationId: string;
  line: "descubra" | "viagens";
  customerPhone: string;
  text: string;
  waMessageId?: string;
}) {
  const phone = input.customerPhone.replace(/\D/g, "");
  if (!phone || !input.text.trim()) return;
  const { data: existing } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("phone", phone)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sessionId = existing?.id as string | undefined;
  if (!sessionId) {
    const { data: created, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        phone,
        line: input.line,
        organization_id: input.organizationId,
        mode: "humano",
      })
      .select("id")
      .single();
    if (error) return;
    sessionId = created.id as string;
  }
  if (input.waMessageId) {
    const { data: dup } = await supabaseAdmin
      .from("messages")
      .select("id")
      .eq("session_id", sessionId)
      .filter("metadata->>wa_message_id", "eq", input.waMessageId)
      .limit(1)
      .maybeSingle();
    if (dup) return;
  }
  await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction: "out",
    author: "agent",
    text: input.text.slice(0, 4000),
    metadata: {
      from_phone_app: true,
      ...(input.waMessageId
        ? { wa_message_id: input.waMessageId, delivery_status: "sent" }
        : {}),
    } as never,
  });
  await supabaseAdmin
    .from("sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
}
