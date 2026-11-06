import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

function verifySig(body: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== header.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

type Change = {
  field?: string;
  value?: { id?: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } };
};

export const Route = createFileRoute("/api/public/webhooks/instagram")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("hub.verify_token");
        if (url.searchParams.get("hub.mode") === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
          return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const body = await request.text();
        if (!verifySig(body, request.headers.get("x-hub-signature-256"))) {
          return new Response("Invalid signature", { status: 401 });
        }
        let payload: { entry?: { id?: string; changes?: Change[] }[] };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const { handleIgComment } = await import("@/lib/instagram.server");
        for (const entry of payload.entry ?? []) {
          for (const ch of entry.changes ?? []) {
            const v = ch.value;
            if (ch.field !== "comments" || !v?.id || !v.text || !entry.id) continue;
            await handleIgComment({
              igAccountId: String(entry.id),
              commentId: String(v.id),
              mediaId: v.media?.id ?? null,
              text: String(v.text).slice(0, 2000),
              username: String(v.from?.username ?? "amigo").slice(0, 60),
              fromId: v.from?.id ?? null,
            }).catch((e) => console.error("instagram comment", e));
          }
        }
        return new Response("ok");
      },
    },
  },
});
