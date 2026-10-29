import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

function verifySig(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== header.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return false;
  }
}

async function resolveInboundChannel(phoneId: string): Promise<{
  organizationId: string;
  line: "descubra" | "viagens";
}> {
  const { resolveChannelByPhoneNumberId, legacyLineFromEnvPhoneId, getGuataOrganizationId } =
    await import("@/lib/organizations.server");
  const fromDb = await resolveChannelByPhoneNumberId(phoneId);
  if (fromDb) return fromDb;
  const line = legacyLineFromEnvPhoneId(phoneId);
  return { organizationId: await getGuataOrganizationId(), line };
}

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (
          mode === "subscribe" &&
          token &&
          token === process.env.META_VERIFY_TOKEN
        ) {
          return new Response(challenge ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        const sig = request.headers.get("x-hub-signature-256");
        const signatureOk = verifySig(body, sig);

        let payload: any = null;
        try {
          payload = JSON.parse(body);
        } catch {
          payload = { _raw: body.slice(0, 2000) };
        }

        const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
        const phoneNumberId: string = value?.metadata?.phone_number_id ?? "";
        const messages: any[] = Array.isArray(value.messages)
          ? value.messages
          : [];
        const statuses: any[] = Array.isArray(value.statuses)
          ? value.statuses
          : [];
        const eventKind = messages.length
          ? "message"
          : statuses.length
            ? "status"
            : "other";

        const inboundMeta = phoneNumberId
          ? await resolveInboundChannel(phoneNumberId)
          : null;

        // 1) Grava SEMPRE a entrega (inclusive as recusadas) — caixa de entrada bruta.
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        let deliveryId: string | null = null;
        try {
          const { data } = await supabaseAdmin
            .from("whatsapp_deliveries")
            .insert({
              signature_ok: signatureOk,
              signature_header: sig,
              phone_number_id: phoneNumberId || null,
              line: inboundMeta?.line ?? null,
              event_kind: eventKind,
              message_ids: [
                ...messages.map((m) => String(m?.id ?? "")),
                ...statuses.map((s) => String(s?.id ?? "")),
              ].filter(Boolean),
              payload,
              error: signatureOk ? null : "assinatura inválida",
            })
            .select("id")
            .single();
          deliveryId = (data?.id as string) ?? null;
        } catch (err) {
          console.error("[whatsapp-webhook] falha ao gravar entrega:", err);
        }

        if (!signatureOk) {
          return new Response("Invalid signature", { status: 401 });
        }

        // 2) Processa mensagens (deduplicadas por id).
        const errors: string[] = [];
        const { processMessage } = await import(
          "@/lib/message-pipeline.server"
        );
        const { normalizeWhatsAppInbound } = await import(
          "@/lib/whatsapp-inbound.server"
        );

        for (const msg of messages) {
          const msgId = String(msg?.id ?? "");
          if (msgId) {
            const { error: dupErr } = await supabaseAdmin
              .from("whatsapp_processed_messages")
              .insert({ message_id: msgId });
            if (dupErr) continue; // já processada
          }
          const phone: string = msg.from ?? "";
          const contactName: string | undefined =
            value.contacts?.[0]?.profile?.name;
          if (!phone) continue;

          if (!inboundMeta) continue;
          const { organizationId, line } = inboundMeta;
          let normalized;
          try {
            normalized = await normalizeWhatsAppInbound(line, msg as Record<string, unknown>);
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            errors.push(`mídia: ${m}`);
            console.error("[whatsapp-webhook] inbound:", err);
            continue;
          }
          if (!normalized?.text) continue;

          try {
            const quotedWaMessageId =
              typeof msg?.context?.id === "string" ? msg.context.id : undefined;
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

        // 3) Recibos: enviada, entregue, visualizada ou falha — em qualquer tipo de mensagem.
        const { applyWhatsAppDeliveryStatus } = await import(
          "@/lib/whatsapp-status.server"
        );
        const echoes = [
          ...(Array.isArray(value.message_echoes) ? value.message_echoes : []),
          ...(Array.isArray(value.smb_message_echoes) ? value.smb_message_echoes : []),
        ];
        if (echoes.length && inboundMeta) {
          const { persistPhoneEcho } = await import("@/lib/crm.server");
          for (const echo of echoes) {
            const text =
              echo?.text?.body ??
              echo?.image?.caption ??
              echo?.button?.text ??
              (echo?.type ? `[${echo.type} pelo celular]` : "");
            const customer = String(echo?.to ?? "");
            if (!customer) continue;
            try {
              await persistPhoneEcho({
                organizationId: inboundMeta.organizationId,
                line: inboundMeta.line,
                customerPhone: customer,
                text: String(text),
                waMessageId: echo?.id ? String(echo.id) : undefined,
              });
            } catch (err) {
              console.error("[whatsapp-webhook] eco do celular:", err);
            }
          }
        }

        for (const st of statuses) {
          const waId = String(st?.id ?? "");
          const status = String(st?.status ?? "");
          if (!waId || !status) continue;
          const detail =
            st?.errors?.[0]?.title ?? st?.errors?.[0]?.message ?? undefined;
          if (status === "failed") {
            errors.push(`envio falhou para ${st.recipient_id}: ${detail ?? "falha"}`);
          }
          try {
            await applyWhatsAppDeliveryStatus(waId, status, detail);
          } catch (err) {
            console.error("[whatsapp-webhook] status:", err);
          }
        }

        if (deliveryId) {
          await supabaseAdmin
            .from("whatsapp_deliveries")
            .update({
              processed: true,
              error: errors.length ? errors.join(" | ").slice(0, 500) : null,
            })
            .eq("id", deliveryId);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
