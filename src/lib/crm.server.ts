import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/meta-send.server";
import {
  followUpDelayMs,
  normalizeFollowUpSteps,
  parseCrm,
  suggestCrm,
  type ConversationCrm,
  type CrmColumnId,
  type FollowUpDelayUnit,
  type FollowUpState,
  type FollowUpStep,
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
  const pending =
    current.followUp?.status === "pending" || current.followUp?.status === "paused";
  if (pending && current.followUp) {
    intake.follow_up = {
      ...current.followUp,
      status: "skipped",
      detail: "O cliente respondeu antes do follow-up.",
      history: [
        ...(current.followUp.history ?? []),
        {
          stepIndex: current.followUp.stepIndex ?? 0,
          at: new Date().toISOString(),
          status: "skipped" as const,
          detail: "Cliente respondeu",
        },
      ].slice(-12),
    };
    changed = true;
  }
  if (changed) await saveIntake(sessionId, intake);
}

/** Cancela follow-up pendente ao arquivar / encerrar. */
export async function cancelFollowUpOnArchive(sessionId: string) {
  const row = await loadSession(sessionId);
  if (!row) return;
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  const current = parseCrm(intake).followUp;
  if (!current || (current.status !== "pending" && current.status !== "paused")) return;
  intake.follow_up = {
    ...current,
    status: "skipped",
    detail: "Conversa arquivada — follow-up cancelado.",
    history: [
      ...(current.history ?? []),
      {
        stepIndex: current.stepIndex ?? 0,
        at: new Date().toISOString(),
        status: "skipped" as const,
        detail: "Arquivada",
      },
    ].slice(-12),
  };
  await saveIntake(sessionId, intake);
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
  input: {
    days?: number;
    text?: string;
    templateName?: string;
    steps?: FollowUpStep[];
  },
): Promise<FollowUpState> {
  const row = await loadSession(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const { parseDoNotContact } = await import("@/lib/contact-opt-out.shared");
  if (parseDoNotContact((row.intake_data ?? {}) as Record<string, unknown>).active) {
    throw new Error("Este contato está em Não contatar — libere antes de agendar follow-up.");
  }

  let steps = input.steps ? normalizeFollowUpSteps(input.steps) : [];
  if (!steps.length) {
    const text = (input.text ?? "").trim();
    if (!text) throw new Error("Escreva o texto do follow-up ou adicione uma etapa.");
    const days = Math.min(30, Math.max(1, input.days ?? 2));
    steps = [
      {
        delay: days,
        unit: "days",
        text: text.slice(0, 1000),
        templateName: input.templateName?.trim() || undefined,
      },
    ];
  }

  const first = steps[0]!;
  const followUp: FollowUpState = {
    dueAt: new Date(Date.now() + followUpDelayMs(first.delay, first.unit)).toISOString(),
    text: first.text,
    templateName: first.templateName,
    status: "pending",
    detail: `Etapa 1/${steps.length} agendada.`,
    steps,
    stepIndex: 0,
    history: [],
  };
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>), follow_up: followUp };
  await saveIntake(sessionId, intake);
  return followUp;
}

export async function clearFollowUp(sessionId: string): Promise<void> {
  const row = await loadSession(sessionId);
  if (!row) throw new Error("Conversa não encontrada");
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  const current = parseCrm(intake).followUp;
  if (!current) return;
  if (current.status === "pending" || current.status === "paused") {
    intake.follow_up = {
      ...current,
      status: "skipped",
      detail: "Cancelado pela equipe.",
    };
  } else {
    delete intake.follow_up;
  }
  await saveIntake(sessionId, intake);
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

function advanceOrFinish(
  follow: FollowUpState,
  stepIndex: number,
  sentDetail: string,
): FollowUpState {
  const steps = follow.steps?.length
    ? follow.steps
    : [
        {
          delay: 1,
          unit: "days" as FollowUpDelayUnit,
          text: follow.text,
          templateName: follow.templateName,
        },
      ];
  const history = [
    ...(follow.history ?? []),
    {
      stepIndex,
      at: new Date().toISOString(),
      status: "sent" as const,
      detail: sentDetail,
      text: follow.text,
    },
  ].slice(-12);

  const nextIndex = stepIndex + 1;
  if (nextIndex < steps.length) {
    const nextStep = steps[nextIndex]!;
    return {
      ...follow,
      stepIndex: nextIndex,
      text: nextStep.text,
      templateName: nextStep.templateName,
      dueAt: new Date(Date.now() + followUpDelayMs(nextStep.delay, nextStep.unit)).toISOString(),
      status: "pending",
      detail: `${sentDetail} Próxima etapa ${nextIndex + 1}/${steps.length} agendada.`,
      steps,
      history,
    };
  }
  return {
    ...follow,
    stepIndex,
    status: "sent",
    detail: sentDetail,
    steps,
    history,
  };
}

async function processDueFollowUpRow(row: SessionCrmRow): Promise<"sent" | "skip" | "retry"> {
  const intake = { ...((row.intake_data ?? {}) as Record<string, unknown>) };
  const { parseDoNotContact } = await import("@/lib/contact-opt-out.shared");
  if (parseDoNotContact(intake).active) {
    const followOpt = parseCrm(intake).followUp;
    if (followOpt && (followOpt.status === "pending" || followOpt.status === "paused")) {
      intake.follow_up = {
        ...followOpt,
        status: "skipped",
        detail: "Não contatar — follow-up cancelado.",
      };
      await saveIntake(row.id, intake);
    }
    return "skip";
  }
  const follow = parseCrm(intake).followUp;
  if (!follow || follow.status !== "pending") return "skip";
  if (new Date(follow.dueAt).getTime() > Date.now()) return "skip";
  const org = row.organization_id;
  if (!org) return "skip";

  const stepIndex = follow.stepIndex ?? 0;
  const open = await windowOpen(row.id);
  let next: FollowUpState = follow;

  if (open) {
    const res = await sendWhatsAppText(
      { organizationId: org, line: row.line },
      row.phone,
      follow.text,
    );
    if (res.ok) {
      next = advanceOrFinish(follow, stepIndex, "Enviado na janela de 24 horas.");
      await supabaseAdmin.from("messages").insert({
        session_id: row.id,
        direction: "out",
        author: "agent",
        text: follow.text,
        metadata: {
          follow_up: true,
          follow_up_step: stepIndex + 1,
          wa_message_id: res.messageId,
          delivery_status: "sent",
        } as never,
      });
      intake.follow_up = next;
      await saveIntake(row.id, intake);
      await supabaseAdmin
        .from("sessions")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", row.id);
      return "sent";
    }
    next = {
      ...follow,
      dueAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      detail: res.reason ?? "Falha no envio. Nova tentativa em 1 hora.",
      history: [
        ...(follow.history ?? []),
        {
          stepIndex,
          at: new Date().toISOString(),
          status: "error" as const,
          detail: res.reason ?? "falha",
        },
      ].slice(-12),
    };
    intake.follow_up = next;
    await saveIntake(row.id, intake);
    return "retry";
  }

  if (follow.templateName) {
    const res = await sendWhatsAppTemplate(
      { organizationId: org, line: row.line },
      row.phone,
      { name: follow.templateName, bodyParams: [] },
    );
    if (res.ok) {
      next = advanceOrFinish(follow, stepIndex, "Enviado como modelo aprovado (fora das 24h).");
      await supabaseAdmin.from("messages").insert({
        session_id: row.id,
        direction: "out",
        author: "agent",
        text: `[modelo ${follow.templateName}] ${follow.text}`,
        metadata: {
          follow_up: true,
          follow_up_step: stepIndex + 1,
          wa_message_id: res.messageId,
          delivery_status: "sent",
        } as never,
      });
      intake.follow_up = next;
      await saveIntake(row.id, intake);
      await supabaseAdmin
        .from("sessions")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", row.id);
      return "sent";
    }
    next = {
      ...follow,
      status: "skipped",
      detail: res.reason ?? "A Meta não aceitou o modelo.",
      history: [
        ...(follow.history ?? []),
        {
          stepIndex,
          at: new Date().toISOString(),
          status: "error" as const,
          detail: res.reason ?? "modelo recusado",
        },
      ].slice(-12),
    };
    intake.follow_up = next;
    await saveIntake(row.id, intake);
    return "skip";
  }

  next = {
    ...follow,
    status: "skipped",
    detail: "Passou de 24 horas e não havia modelo aprovado nesta etapa.",
    history: [
      ...(follow.history ?? []),
      {
        stepIndex,
        at: new Date().toISOString(),
        status: "skipped" as const,
        detail: "Sem template fora da janela",
      },
    ].slice(-12),
  };
  intake.follow_up = next;
  await saveIntake(row.id, intake);
  return "skip";
}

/** Envia follow-ups vencidos desta agência. Chamado ao abrir o painel e ao receber mensagem. */
export async function runDueFollowUps(orgId: string) {
  const { releaseMistakenTemplateHandoffs } = await import("@/lib/campaigns.server");
  await releaseMistakenTemplateHandoffs(orgId).catch((e) =>
    console.error("[campaigns] template handoff:", e),
  );
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, phone, line, organization_id, intake_data")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(200);
  let sent = 0;
  for (const row of (data ?? []) as SessionCrmRow[]) {
    if (sent >= 12) break;
    const result = await processDueFollowUpRow(row);
    if (result === "sent") sent += 1;
  }
}

/** Cron: todas as orgs com follow-up pendente. */
export async function runDueFollowUpsForAllOrganizations(): Promise<{ processed: number }> {
  const { data } = await supabaseAdmin
    .from("sessions")
    .select("id, phone, line, organization_id, intake_data")
    .is("archived_at", null)
    .filter("intake_data->follow_up->>status", "eq", "pending")
    .limit(80);
  let processed = 0;
  for (const row of (data ?? []) as SessionCrmRow[]) {
    const result = await processDueFollowUpRow(row);
    if (result !== "skip") processed += 1;
  }
  console.info("[follow-up cron] processados:", processed);
  return { processed };
}

/** Mensagem que a equipe enviou pelo aplicativo do celular, espelhada no painel. */
export async function persistPhoneEcho(input: {
  organizationId: string;
  line: "descubra" | "viagens";
  customerPhone: string;
  text: string;
  waMessageId?: string;
  mediaPath?: string;
  mediaMime?: string;
  mediaKind?: "image" | "audio" | "video" | "document";
  outboundKind?: string;
  filename?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { canonicalWaPhone } = await import("@/lib/whatsapp-phone.server");
  const phone = canonicalWaPhone(input.customerPhone);
  const text = input.text.trim() || "(mensagem pelo celular)";
  if (!phone) return { ok: false, reason: "telefone vazio" };

  const { data: existing } = await supabaseAdmin
    .from("sessions")
    .select("id, intake_data")
    .eq("organization_id", input.organizationId)
    .eq("line", input.line)
    .eq("phone", phone)
    .maybeSingle();

  let sessionId = existing?.id as string | undefined;
  let fallbackIntake = existing?.intake_data;
  if (!sessionId) {
    const { data: fallback } = await supabaseAdmin
      .from("sessions")
      .select("id, intake_data")
      .eq("organization_id", input.organizationId)
      .eq("phone", phone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionId = fallback?.id as string | undefined;
    fallbackIntake = fallback?.intake_data ?? fallbackIntake;
  }

  const intakeBase = fallbackIntake as Record<string, unknown> | undefined;

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
    if (error) {
      console.error("[persistPhoneEcho] criar sessão:", error.message);
      return { ok: false, reason: error.message };
    }
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
    if (dup) return { ok: true };
  }
  const { error: msgErr } = await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction: "out",
    author: "agent",
    text: text.slice(0, 4000),
    metadata: {
      from_phone_app: true,
      ...(input.waMessageId
        ? { wa_message_id: input.waMessageId, delivery_status: "sent" }
        : {}),
      ...(input.mediaPath ? { media_path: input.mediaPath } : {}),
      ...(input.mediaMime ? { media_mime: input.mediaMime } : {}),
      ...(input.mediaKind ? { media_kind: input.mediaKind } : {}),
      ...(input.outboundKind ? { outbound_kind: input.outboundKind } : {}),
      ...(input.filename ? { filename: input.filename } : {}),
    } as never,
  });
  if (msgErr) {
    console.error("[persistPhoneEcho] inserir mensagem:", msgErr.message);
    return { ok: false, reason: msgErr.message };
  }
  const intake = { ...((intakeBase ?? {}) as Record<string, unknown>) };
  delete intake["owner_alert_at"];
  intake["staff_phone_at"] = new Date().toISOString();
  const { error: sessErr } = await supabaseAdmin
    .from("sessions")
    .update({
      mode: "humano",
      intake_state: null,
      last_message_at: new Date().toISOString(),
      intake_data: intake as never,
    })
    .eq("id", sessionId);
  if (sessErr) {
    console.error("[persistPhoneEcho] atualizar sessão:", sessErr.message);
    return { ok: false, reason: sessErr.message };
  }
  return { ok: true };
}
