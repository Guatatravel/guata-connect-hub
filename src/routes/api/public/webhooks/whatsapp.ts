import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { processMessage } from "@/lib/message-pipeline.server";

function verifySig(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

function lineFromPhoneId(phoneId: string): "descubra" | "viagens" {
  if (phoneId === process.env.META_PHONE_NUMBER_ID_VIAGENS) return "viagens";
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
        if (!verifySig(body, sig)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const entries = payload?.entry ?? [];
        for (const entry of entries) {
          for (const change of entry.changes ?? []) {
            const value = change.value ?? {};
            const phoneId = value.metadata?.phone_number_id ?? "";
            const line = lineFromPhoneId(phoneId);
            for (const msg of value.messages ?? []) {
              if (msg.type !== "text") continue;
              const text: string = msg.text?.body ?? "";
              const phone: string = msg.from ?? "";
              const contactName: string | undefined =
                value.contacts?.[0]?.profile?.name;
              if (!text || !phone) continue;
              try {
                await processMessage({ line, phone, contactName, text });
              } catch (err) {
                console.error("[whatsapp-webhook] pipeline:", err);
              }
            }
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});