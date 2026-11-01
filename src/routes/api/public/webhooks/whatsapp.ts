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

        let payload: unknown = null;
        try {
          payload = JSON.parse(body);
        } catch {
          payload = { _raw: body.slice(0, 2000) };
        }

        const value =
          (payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] })?.entry?.[0]
            ?.changes?.[0]?.value ?? {};
        const phoneNumberId: string = String(value?.metadata?.phone_number_id ?? "");
        const messages: unknown[] = Array.isArray(value.messages) ? value.messages : [];
        const statuses: unknown[] = Array.isArray(value.statuses) ? value.statuses : [];
        const eventKind = messages.length
          ? "message"
          : statuses.length
            ? "status"
            : "other";

        const inboundMeta = phoneNumberId
          ? await resolveInboundChannel(phoneNumberId)
          : null;

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
                ...messages.map((m) => String((m as { id?: string })?.id ?? "")),
                ...statuses.map((s) => String((s as { id?: string })?.id ?? "")),
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

        const { processWhatsAppWebhookDelivery } = await import(
          "@/lib/whatsapp-webhook-process.server"
        );
        try {
          await processWhatsAppWebhookDelivery({
            deliveryId,
            payload,
            phoneNumberId,
            inboundMeta,
          });
        } catch (err) {
          console.error("[whatsapp-webhook] processamento:", err);
        }
        try {
          const { resumeStaleHandoffsForAllOrganizations } = await import(
            "@/lib/handoff-resume.server"
          );
          await resumeStaleHandoffsForAllOrganizations();
        } catch (e) {
          console.error("[handoff] cron sweep:", e);
        }

        return Response.json({ ok: true });
      },
    },
  },
});
