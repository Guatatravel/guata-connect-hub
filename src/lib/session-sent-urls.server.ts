/**
 * URLs já enviadas ao cliente na sessão (evita link repetido).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function normalizeOutboundUrl(raw: string): string {
  const u = raw.trim();
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.toLowerCase();
  } catch {
    return u.toLowerCase().split("?")[0] ?? u.toLowerCase();
  }
}

export function extractHttpUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')]+/gi) ?? [];
  return [...new Set(found.map((u) => normalizeOutboundUrl(u)))];
}

export async function collectUrlsSentInSession(sessionId: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("text, metadata")
    .eq("session_id", sessionId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(50);

  const urls = new Set<string>();
  for (const row of data ?? []) {
    const meta = row.metadata as Record<string, unknown> | null;
    if (typeof meta?.knowledge_link === "string") {
      urls.add(normalizeOutboundUrl(meta.knowledge_link));
    }
    for (const u of extractHttpUrls(String(row.text ?? ""))) urls.add(u);
  }
  return urls;
}
