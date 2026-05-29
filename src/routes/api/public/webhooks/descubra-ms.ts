import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface EventLike {
  id?: string | number;
  title?: string;
  name?: string;
  description?: string;
  body?: string;
  city?: string;
  location?: string;
  starts_at?: string;
  start_date?: string;
  image_url?: string;
  cover_url?: string;
  link_url?: string;
  url?: string;
  slug?: string;
}

function normalize(payload: unknown): EventLike | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  // Supabase Database Webhook: { type, table, record, old_record }
  if (p.record && typeof p.record === "object") return p.record as EventLike;
  // Custom event.published format: { event: {...} } or flat
  if (p.event && typeof p.event === "object") return p.event as EventLike;
  return p as EventLike;
}

export const Route = createFileRoute("/api/public/webhooks/descubra-ms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.DESCUBRA_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Webhook não configurado", { status: 503 });
        }
        const auth = request.headers.get("authorization") ?? "";
        const expected = `Bearer ${secret}`;
        if (!timingSafeEqual(auth, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const ev = normalize(payload);
        if (!ev) return new Response("Payload inválido", { status: 400 });

        const title = ev.title ?? ev.name;
        if (!title) return new Response("Evento sem título", { status: 400 });

        const startDate = ev.starts_at ?? ev.start_date ?? null;
        const city = ev.city ?? ev.location ?? "";
        const link = ev.link_url ?? ev.url ?? (ev.slug ? `https://descubra.ms/eventos/${ev.slug}` : null);
        const body =
          (ev.description ?? ev.body ?? "").trim() ||
          `${title}${city ? ` em ${city}` : ""}${startDate ? ` — ${startDate.slice(0, 10)}` : ""}`;

        const { error } = await supabaseAdmin.from("channel_posts").upsert(
          {
            source: "descubra-ms",
            external_id: ev.id != null ? String(ev.id) : null,
            title,
            body,
            image_url: ev.image_url ?? ev.cover_url ?? null,
            link_url: link,
            event_starts_at: startDate,
            metadata: ev as never,
            status: "rascunho",
          },
          { onConflict: "source,external_id", ignoreDuplicates: false },
        );

        if (error) {
          console.error("[descubra-webhook] erro:", error);
          return new Response("Erro ao gravar", { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});