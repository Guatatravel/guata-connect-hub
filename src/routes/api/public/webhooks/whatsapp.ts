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

function lineFromPhoneId(phoneId: string): "descubra" | "viagens" {
  const viagens = process.env.META_PHONE_NUMBER_ID_VIAGENS;
  if (viagens && phoneId === viagens) return "viagens";
  return "descubra";
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
              line: phoneNumberId ? lineFromPhoneId(phoneNumberId) : null,
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

        for (const msg of messages) {
          const msgId = String(msg?.id ?? "");
          if (msgId) {
            const { error: dupErr } = await supabaseAdmin
              .from("whatsapp_processed_messages")
              .insert({ message_id: msgId });
            if (dupErr) continue; // já processada
          }
          if (msg?.type !== "text") {
            errors.push(`tipo não suportado: ${msg?.type}`);
            continue;
          }
          const text: string = msg.text?.body ?? "";
          const phone: string = msg.from ?? "";
          const contactName: string | undefined =
            value.contacts?.[0]?.profile?.name;
          if (!text || !phone) continue;
          try {
            await processMessage({
              line: lineFromPhoneId(phoneNumberId),
              phone,
              contactName,
              text,
            });
          } catch (err) {
            const m = err instanceof Error ? err.message : String(err);
            errors.push(m);
            console.error("[whatsapp-webhook] pipeline:", err);
          }
        }

        // 3) Registra falhas de envio informadas pela Meta.
        for (const st of statuses) {
          if (st?.status === "failed") {
            const detail =
              st?.errors?.[0]?.title ?? st?.errors?.[0]?.message ?? "falha";
            errors.push(`envio falhou para ${st.recipient_id}: ${detail}`);
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
