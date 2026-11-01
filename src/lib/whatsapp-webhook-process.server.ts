/**
 * Processamento assíncrono do webhook Meta — após gravar a entrega e responder 200.
 */
export async function processWhatsAppWebhookDelivery(input: {
  deliveryId: string | null;
  payload: unknown;
  phoneNumberId: string;
  inboundMeta: { organizationId: string; line: "descubra" | "viagens" } | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const value =
    (input.payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })
      ?.entry?.[0]?.changes?.[0]?.value ?? {};
  const messages: unknown[] = Array.isArray(value.messages) ? value.messages : [];
  const statuses: unknown[] = Array.isArray(value.statuses) ? value.statuses : [];

  const errors: string[] = [];
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

    if (!input.inboundMeta) continue;
    const { organizationId, line } = input.inboundMeta;

    let normalized;
    try {
      normalized = await normalizeWhatsAppInbound(line, msg);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      errors.push(`mídia: ${m}`);
      console.error("[whatsapp-webhook] inbound:", err);
      continue;
    }
    if (!normalized?.text) continue;

    try {
      const ctx = msg.context as { id?: string } | undefined;
      const quotedWaMessageId = typeof ctx?.id === "string" ? ctx.id : undefined;
      await processMessage({
        organizationId,
        line,
        phone,
        contactName,
        text: normalized.text,
        messageId: msgId || undefined,
        quotedWaMessageId,
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

  const { applyWhatsAppDeliveryStatus } = await import("@/lib/whatsapp-status.server");
  const echoes = [
    ...(Array.isArray(value.message_echoes) ? value.message_echoes : []),
    ...(Array.isArray(value.smb_message_echoes) ? value.smb_message_echoes : []),
  ];
  if (echoes.length && input.inboundMeta) {
    const { persistPhoneEcho } = await import("@/lib/crm.server");
    for (const echo of echoes as Record<string, unknown>[]) {
      const text =
        (echo?.text as { body?: string })?.body ??
        (echo?.image as { caption?: string })?.caption ??
        (echo?.button as { text?: string })?.text ??
        (echo?.type ? `[${echo.type} pelo celular]` : "");
      const customer = String(echo?.to ?? "");
      if (!customer) continue;
      try {
        await persistPhoneEcho({
          organizationId: input.inboundMeta.organizationId,
          line: input.inboundMeta.line,
          customerPhone: customer,
          text: String(text),
          waMessageId: echo?.id ? String(echo.id) : undefined,
        });
      } catch (err) {
        console.error("[whatsapp-webhook] eco do celular:", err);
      }
    }
  }

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
