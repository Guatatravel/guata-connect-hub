/**
 * Importa conversas antigas do app WhatsApp Business (webhook history / coexistência).
 * Não aciona o bot — só grava no painel com metadata.coexistence_history.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canonicalWaPhone } from "@/lib/whatsapp-phone.server";
import { echoTextFromRecord } from "@/lib/whatsapp-webhook.shared";

type Line = "descubra" | "viagens";

function digits(value: string | undefined): string {
  return canonicalWaPhone(String(value ?? ""));
}

function historyMessageText(msg: Record<string, unknown>): string {
  const type = String(msg.type ?? "");
  if (type === "media_placeholder") return "";
  const text = echoTextFromRecord(msg).trim();
  if (text) return text.slice(0, 4000);
  if (type && type !== "text") return `[${type} · histórico do app]`;
  return "";
}

function messageIsFromCustomer(
  msg: Record<string, unknown>,
  businessPhone: string,
  threadCustomerPhone: string,
): boolean {
  if (msg.from_user_id) return true;
  const from = digits(String(msg.from ?? ""));
  if (from && businessPhone && from === businessPhone) return false;
  if (from && threadCustomerPhone && from === threadCustomerPhone) return true;
  if (from && businessPhone && from !== businessPhone) return true;
  return Boolean(msg.from_user_id);
}

async function resolveSessionId(
  organizationId: string,
  line: Line,
  customerPhone: string,
): Promise<string> {
  const phone = canonicalWaPhone(customerPhone);
  const { data: existing } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("line", line)
    .eq("phone", phone)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: fallback } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("phone", phone)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback?.id) return fallback.id as string;

  const { data: created, error } = await supabaseAdmin
    .from("sessions")
    .insert({
      phone,
      line,
      organization_id: organizationId,
      mode: "bot",
      intake_data: { coexistence_history: true } as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

async function importHistoryRow(input: {
  organizationId: string;
  line: Line;
  customerPhone: string;
  direction: "in" | "out";
  author: "user" | "agent";
  text: string;
  waMessageId: string;
  deviceTimestamp?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const text = input.text.trim();
  if (!text) return { ok: true };
  const phone = canonicalWaPhone(input.customerPhone);
  if (!phone) return { ok: false, reason: "telefone vazio" };

  const sessionId = await resolveSessionId(input.organizationId, input.line, phone);

  const { data: dup } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("session_id", sessionId)
    .filter("metadata->>wa_message_id", "eq", input.waMessageId)
    .limit(1)
    .maybeSingle();
  if (dup) return { ok: true };

  const createdAt =
    input.deviceTimestamp && input.deviceTimestamp > 0
      ? new Date(input.deviceTimestamp * 1000).toISOString()
      : undefined;

  const { error: msgErr } = await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction: input.direction,
    author: input.author,
    text,
    ...(createdAt ? { created_at: createdAt } : {}),
    metadata: {
      wa_message_id: input.waMessageId,
      coexistence_history: true,
    } as never,
  });
  if (msgErr) return { ok: false, reason: msgErr.message };

  const bumpAt = createdAt ?? new Date().toISOString();
  const { data: sess } = await supabaseAdmin
    .from("sessions")
    .select("last_message_at, intake_data")
    .eq("id", sessionId)
    .maybeSingle();
  const prior = sess?.last_message_at as string | undefined;
  const nextLast = prior && prior > bumpAt ? prior : bumpAt;
  const intake = { ...((sess?.intake_data as Record<string, unknown> | null) ?? {}) };
  intake.coexistence_history = true;
  await supabaseAdmin
    .from("sessions")
    .update({
      last_message_at: nextLast,
      intake_data: intake as never,
    })
    .eq("id", sessionId);

  return { ok: true };
}

async function importThread(
  thread: Record<string, unknown>,
  businessPhone: string,
  meta: { organizationId: string; line: Line },
  errors: string[],
): Promise<void> {
  const ctx = thread.context as { wa_id?: string; username?: string } | undefined;
  const customerPhone = digits(
    String(thread.id ?? "") || String(ctx?.wa_id ?? ""),
  );
  if (!customerPhone) {
    errors.push("histórico: thread sem telefone do cliente");
    return;
  }
  const messages = Array.isArray(thread.messages) ? thread.messages : [];
  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const type = String(msg.type ?? "");
    if (type === "media_placeholder") continue;
    const waId = String(msg.id ?? "").trim();
    if (!waId) continue;
    const text = historyMessageText(msg);
    if (!text) continue;
    const fromCustomer = messageIsFromCustomer(msg, businessPhone, customerPhone);
    const ts = Number(msg.timestamp);
    const result = await importHistoryRow({
      organizationId: meta.organizationId,
      line: meta.line,
      customerPhone,
      direction: fromCustomer ? "in" : "out",
      author: fromCustomer ? "user" : "agent",
      text,
      waMessageId: waId,
      deviceTimestamp: Number.isFinite(ts) ? ts : undefined,
    });
    if (!result.ok) errors.push(`histórico ${waId}: ${result.reason ?? "falha"}`);
  }
}

async function importHistoryMediaMessages(
  value: Record<string, unknown>,
  businessPhone: string,
  meta: { organizationId: string; line: Line },
  errors: string[],
): Promise<void> {
  const messages = Array.isArray(value.messages) ? value.messages : [];
  for (const raw of messages) {
    const msg = raw as Record<string, unknown>;
    const customerPhone = digits(String(msg.from ?? ""));
    if (!customerPhone || customerPhone === businessPhone) continue;
    const waId = String(msg.id ?? "").trim();
    if (!waId) continue;
    const text = historyMessageText(msg);
    if (!text) continue;
    const ts = Number(msg.timestamp);
    const result = await importHistoryRow({
      organizationId: meta.organizationId,
      line: meta.line,
      customerPhone,
      direction: "in",
      author: "user",
      text,
      waMessageId: waId,
      deviceTimestamp: Number.isFinite(ts) ? ts : undefined,
    });
    if (!result.ok) errors.push(`histórico mídia ${waId}: ${result.reason ?? "falha"}`);
  }
}

export async function processCoexistenceHistoryWebhook(
  value: Record<string, unknown>,
  meta: { organizationId: string; line: Line } | null,
  errors: string[],
): Promise<void> {
  if (!meta) {
    errors.push("histórico: número não vinculado a nenhuma agência");
    return;
  }

  const display =
    digits(
      String(
        (value.metadata as { display_phone_number?: string } | undefined)
          ?.display_phone_number ?? "",
      ),
    ) || "";

  for (const block of (Array.isArray(value.history) ? value.history : []) as Record<
    string,
    unknown
  >[]) {
    const blockErrors = block.errors as { message?: string; title?: string }[] | undefined;
    if (blockErrors?.length) {
      const line =
        blockErrors[0]?.message ?? blockErrors[0]?.title ?? "compartilhamento desligado";
      errors.push(`histórico: ${line}`);
      continue;
    }
    const threads = Array.isArray(block.threads) ? block.threads : [];
    for (const thread of threads as Record<string, unknown>[]) {
      await importThread(thread, display, meta, errors);
    }
  }

  const hasThreads = (value.history as unknown[] | undefined)?.some(
    (b) =>
      Array.isArray((b as { threads?: unknown[] })?.threads) &&
      ((b as { threads?: unknown[] }).threads?.length ?? 0) > 0,
  );
  if (!hasThreads && Array.isArray(value.messages) && value.messages.length > 0) {
    await importHistoryMediaMessages(value, display, meta, errors);
  }

  try {
    const { applyHistoryWebhookToCoexistenceMeta } = await import(
      "@/lib/whatsapp-coexistence-sync.server"
    );
    await applyHistoryWebhookToCoexistenceMeta(meta.organizationId, value);
  } catch (err) {
    console.error("[coexistence] meta do webhook history:", err);
  }
}