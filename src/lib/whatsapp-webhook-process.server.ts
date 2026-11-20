/**
 * Processamento assíncrono do webhook Meta — após gravar a entrega e responder 200.
 */
import {
  echoCustomerPhone,
  echoTextFromRecord,
  iterateWebhookChanges,
  phoneEchoesFromValue,
  phoneNumberIdFromValue,
} from "@/lib/whatsapp-webhook.shared";

type InboundMeta = { organizationId: string; line: "descubra" | "viagens" };

async function resolveMetaForValue(
  value: Record<string, unknown>,
  fallback: InboundMeta | null,
): Promise<InboundMeta | null> {
  const fromValue = phoneNumberIdFromValue(value);
  if (fromValue) {
    const { resolveWhatsAppInboundMeta } = await import("@/lib/organizations.server");
    const resolved = await resolveWhatsAppInboundMeta(fromValue);
    if (resolved) return resolved;
  }
  return fallback;
}

async function processInboundMessages(
  value: Record<string, unknown>,
  meta: InboundMeta | null,
  errors: string[],
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const messages: unknown[] = Array.isArray(value.messages) ? value.messages : [];
  const { processMessage } = await import("@/lib/message-pipeline.server");
  const { normalizeWhatsAppInbound } = await import("@/lib/whatsapp-inbound.server");

  for (const rawMsg of messages) {
    const msg = rawMsg as Record<string, unknown>;
    const msgId = String(msg?.id ?? "");
    const msgType = String(msg?.type ?? "");

    if (msgType === "revoke" && (msg.revoke as { original_message_id?: string })?.original_message_id) {
      try {
        const { applyWhatsAppMessageRevoke } = await import("@/lib/message-revisions.server");
        await applyWhatsAppMessageRevoke(
          String((msg.revoke as { original_message_id: string }).original_message_id),
        );
      } catch (err) {
        console.error("[whatsapp-webhook] revoke:", err);
      }
      if (msgId) {
        await supabaseAdmin
          .from("whatsapp_processed_messages")
          .insert({ message_id: msgId })
          .then(
            () => {},
            () => {},
          );
      }
      continue;
    }

    if (msgType === "edit" && (msg.edit as { original_message_id?: string })?.original_message_id) {
      const inner = (msg.edit as { message?: Record<string, unknown> }).message;
      const innerType = String(inner?.type ?? "text");
      let newText: string | undefined;
      if (innerType === "text") {
        newText = (inner?.text as { body?: string } | undefined)?.body;
      } else if (innerType === "image") {
        newText = (inner?.image as { caption?: string } | undefined)?.caption ?? "";
      } else if (innerType === "video") {
        newText = (inner?.video as { caption?: string } | undefined)?.caption ?? "";
      } else if (innerType === "document") {
        newText = (inner?.document as { caption?: string } | undefined)?.caption ?? "";
      }
      if (newText !== undefined) {
        try {
          const { applyWhatsAppMessageEdit } = await import("@/lib/message-revisions.server");
          await applyWhatsAppMessageEdit(
            String((msg.edit as { original_message_id: string }).original_message_id),
            newText,
          );
        } catch (err) {
          console.error("[whatsapp-webhook] edit:", err);
        }
      }
      if (msgId) {
        await supabaseAdmin
          .from("whatsapp_processed_messages")
          .insert({ message_id: msgId })
          .then(
            () => {},
            () => {},
          );
      }
      continue;
    }

    if (msgId) {
      const { error: dupErr } = await supabaseAdmin
        .from("whatsapp_processed_messages")
        .insert({ message_id: msgId });
      if (dupErr) continue;
    }

    const phone = String(msg.from ?? "");
    const contacts = value.contacts as { profile?: { name?: string } }[] | undefined;
    const contactName = contacts?.[0]?.profile?.name;
    if (!phone) continue;

    if (!meta) continue;
    const { organizationId, line } = meta;

    let normalized;
    try {
      normalized = await normalizeWhatsAppInbound(line, msg, organizationId);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      errors.push(`mídia: ${m}`);
      console.error("[whatsapp-webhook] inbound:", err);
      continue;
    }
    if (!normalized?.text) continue;

    try {
      const ctx = msg.context as { id?: string; forwarded?: boolean } | undefined;
      const quotedWaMessageId = typeof ctx?.id === "string" ? ctx.id : undefined;
      const quotedForwarded = ctx?.forwarded === true;
      const ref = msg.referral as
        | {
            source_type?: string;
            headline?: string;
            body?: string;
            source_url?: string;
          }
        | undefined;
      await processMessage({
        organizationId,
        line,
        phone,
        contactName,
        text: normalized.text,
        messageId: msgId || undefined,
        quotedWaMessageId,
        quotedForwarded,
        referral: ref
          ? {
              source_type: ref.source_type,
              headline: ref.headline,
              body: ref.body,
            }
          : undefined,
        inboundKind: normalized.inboundKind,
        mediaPath: normalized.attachment?.storagePath,
        mediaMime: normalized.attachment?.mimeType,
        mediaKind: normalized.attachment?.mediaKind,
        mediaFilename: normalized.attachment?.filename,
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      errors.push(m);
      console.error("[whatsapp-webhook] pipeline:", err);
    }
  }
}

async function processEchoRecord(
  echo: Record<string, unknown>,
  meta: InboundMeta,
  errors: string[],
): Promise<void> {
  const echoType = String(echo?.type ?? "");

  if (echoType === "revoke" && (echo.revoke as { original_message_id?: string })?.original_message_id) {
    try {
      const { applyWhatsAppMessageRevoke } = await import("@/lib/message-revisions.server");
      await applyWhatsAppMessageRevoke(
        String((echo.revoke as { original_message_id: string }).original_message_id),
      );
    } catch (err) {
      console.error("[whatsapp-webhook] eco revoke:", err);
    }
    return;
  }

  if (echoType === "edit" && (echo.edit as { original_message_id?: string })?.original_message_id) {
    const inner = (echo.edit as { message?: Record<string, unknown> }).message ?? echo;
    const newText = echoTextFromRecord(inner as Record<string, unknown>);
    if (newText) {
      try {
        const { applyWhatsAppMessageEdit } = await import("@/lib/message-revisions.server");
        await applyWhatsAppMessageEdit(
          String((echo.edit as { original_message_id: string }).original_message_id),
          newText,
        );
      } catch (err) {
        console.error("[whatsapp-webhook] eco edit:", err);
      }
    }
    return;
  }

  const customer = echoCustomerPhone(echo);
  if (!customer) {
    errors.push("eco do celular sem destinatário (to)");
    return;
  }

  const { persistPhoneEcho } = await import("@/lib/crm.server");
  const { normalizePhoneEchoMedia } = await import("@/lib/whatsapp-echo-media.server");
  let text = echoTextFromRecord(echo).trim();
  let mediaPayload: {
    mediaPath?: string;
    mediaMime?: string;
    mediaKind?: "image" | "audio" | "video" | "document";
    outboundKind?: string;
    filename?: string;
  } = {};
  const needsMedia =
    echoType === "audio" ||
    echoType === "voice" ||
    echoType === "image" ||
    echoType === "video" ||
    echoType === "document";
  if (needsMedia || (!text && echoType !== "text")) {
    try {
      const normalized = await normalizePhoneEchoMedia(
        meta.line,
        meta.organizationId,
        customer,
        echo,
      );
      text = normalized.text.trim() || text;
      if (normalized.attachment) {
        mediaPayload = {
          mediaPath: normalized.attachment.storagePath,
          mediaMime: normalized.attachment.mimeType,
          mediaKind: normalized.attachment.mediaKind,
          outboundKind: normalized.attachment.outboundKind,
          filename: normalized.attachment.filename,
        };
      }
    } catch (err) {
      console.error("[whatsapp-webhook] eco mídia:", err);
      errors.push(err instanceof Error ? err.message : "eco mídia");
    }
  }
  if (!text && echoType !== "text" && !mediaPayload.mediaPath) {
    return;
  }
  try {
    const result = await persistPhoneEcho({
      organizationId: meta.organizationId,
      line: meta.line,
      customerPhone: customer,
      text: text || "(mensagem pelo celular)",
      waMessageId: echo?.id ? String(echo.id) : undefined,
      ...mediaPayload,
    });
    if (!result.ok) errors.push(`eco: ${result.reason ?? "falha ao gravar"}`);
  } catch (err) {
    console.error("[whatsapp-webhook] eco do celular:", err);
    errors.push(err instanceof Error ? err.message : "eco do celular");
  }
}

async function processPhoneEchoes(
  value: Record<string, unknown>,
  fallbackMeta: InboundMeta | null,
  phoneNumberIdHint: string,
  errors: string[],
): Promise<void> {
  const echoes = phoneEchoesFromValue(value);
  if (!echoes.length) return;

  let meta = await resolveMetaForValue(value, fallbackMeta);
  if (!meta && phoneNumberIdHint) {
    const { resolveWhatsAppInboundMeta } = await import("@/lib/organizations.server");
    meta = await resolveWhatsAppInboundMeta(phoneNumberIdHint);
  }
  if (!meta) {
    errors.push(
      `eco do celular: phone_number_id ${phoneNumberIdFromValue(value) || phoneNumberIdHint || "?"} não vinculado a nenhuma agência`,
    );
    return;
  }

  for (const echo of echoes as Record<string, unknown>[]) {
    await processEchoRecord(echo, meta, errors);
  }
}

async function processStatuses(
  value: Record<string, unknown>,
  errors: string[],
): Promise<void> {
  const statuses: unknown[] = Array.isArray(value.statuses) ? value.statuses : [];
  const { applyWhatsAppDeliveryStatus } = await import("@/lib/whatsapp-status.server");

  for (const rawSt of statuses) {
    const st = rawSt as Record<string, unknown>;
    const waId = String(st?.id ?? "");
    const status = String(st?.status ?? "");
    if (!waId || !status) continue;
    const errList = st?.errors as { title?: string; message?: string }[] | undefined;
    const detail = errList?.[0]?.title ?? errList?.[0]?.message ?? undefined;
    if (status === "failed") {
      errors.push(`envio falhou para ${st.recipient_id}: ${detail ?? "falha"}`);
    }
    try {
      await applyWhatsAppDeliveryStatus(waId, status, detail);
    } catch (err) {
      console.error("[whatsapp-webhook] status:", err);
    }
  }
}

async function processWebhookValue(
  value: Record<string, unknown>,
  fallbackMeta: InboundMeta | null,
  phoneNumberIdHint: string,
  errors: string[],
): Promise<void> {
  const meta = await resolveMetaForValue(value, fallbackMeta);
  await processInboundMessages(value, meta, errors);
  await processPhoneEchoes(value, fallbackMeta, phoneNumberIdHint, errors);
  await processStatuses(value, errors);
}

export async function processWhatsAppWebhookDelivery(input: {
  deliveryId: string | null;
  payload: unknown;
  phoneNumberId: string;
  inboundMeta: InboundMeta | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const errors: string[] = [];
  const slices = iterateWebhookChanges(input.payload);

  if (slices.length === 0) {
    const legacy =
      (input.payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })
        ?.entry?.[0]?.changes?.[0]?.value ?? null;
    if (legacy) {
      await processWebhookValue(legacy, input.inboundMeta, input.phoneNumberId, errors);
    }
  } else {
    const { historyBlocksFromValue } = await import("@/lib/whatsapp-webhook.shared");
    for (const { field, value } of slices) {
      if (field === "history" || historyBlocksFromValue(value).length > 0) {
        const meta = await resolveMetaForValue(value, input.inboundMeta);
        const { processCoexistenceHistoryWebhook } = await import(
          "@/lib/whatsapp-history.server"
        );
        await processCoexistenceHistoryWebhook(
          value,
          meta ? { organizationId: meta.organizationId, line: meta.line } : null,
          errors,
        );
        continue;
      }
      await processWebhookValue(value, input.inboundMeta, input.phoneNumberId, errors);
    }
  }

  if (input.deliveryId) {
    await supabaseAdmin
      .from("whatsapp_deliveries")
      .update({
        processed: true,
        error: errors.length ? errors.join(" | ").slice(0, 500) : null,
      })
      .eq("id", input.deliveryId);
  }
}