/**
 * Cliente Supabase server-only para o projeto Descubra MS.
 * Usa SERVICE ROLE — nunca importar de código client-side.
 * Acessa: guata_knowledge_base, ai_prompt_configs, events_public.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getDescubraAdminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.DESCUBRA_SUPABASE_URL;
  const key = process.env.DESCUBRA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function isDescubraConfigured(): boolean {
  return Boolean(
    process.env.DESCUBRA_SUPABASE_URL &&
      process.env.DESCUBRA_SUPABASE_SERVICE_ROLE_KEY,
  );
}

export interface DescubraEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  city: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  link_url: string | null;
}

/** Lista eventos publicados do Descubra (server-side, com service role). */
export async function listDescubraEvents(limit = 50): Promise<DescubraEvent[]> {
  const client = getDescubraAdminClient();
  if (!client) return [];
  // Tenta tabela "events_public", depois fallback para "events"
  for (const table of ["events_public", "events"]) {
    const { data, error } = await client
      .from(table)
      .select(
        "id,title,description,location,city,starts_at,ends_at,image_url,link_url",
      )
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (!error && data) return data as DescubraEvent[];
  }
  return [];
}

export interface KbEntry {
  id: string;
  question: string;
  answer: string;
  category: string | null;
}

/** Busca KB do Guatá. Filtra por keyword simples (ILIKE). */
export async function searchGuataKnowledgeBase(
  query: string,
  limit = 5,
): Promise<KbEntry[]> {
  const client = getDescubraAdminClient();
  if (!client || !query.trim()) return [];
  const { data } = await client
    .from("guata_knowledge_base")
    .select("id,question,answer,category")
    .or(`question.ilike.%${query}%,answer.ilike.%${query}%`)
    .limit(limit);
  return (data ?? []) as KbEntry[];
}

/** Busca e une TODOS os blocos ativos do prompt do Guatá (system, personality, instructions, rules, disclaimer). */
export async function getGuataPersona(): Promise<string | null> {
  const client = getDescubraAdminClient();
  if (!client) return null;
  const { data } = await client
    .from("ai_prompt_configs")
    .select("*")
    .eq("chatbot_name", "guata");
  if (!data || data.length === 0) return null;
  const order = ["system", "personality", "instructions", "rules", "disclaimer"];
  const rows = (data as Record<string, unknown>[]).filter(
    (r) => r.is_active !== false,
  );
  const typeOf = (r: Record<string, unknown>) =>
    String(r.prompt_type ?? r.type ?? r.config_type ?? r.section ?? "").toLowerCase();
  rows.sort((a, b) => {
    const ia = order.indexOf(typeOf(a));
    const ib = order.indexOf(typeOf(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const parts = rows
    .map((r) => {
      const text =
        (r.system_prompt as string | undefined) ??
        (r.prompt as string | undefined) ??
        (r.content as string | undefined) ??
        "";
      if (!text.trim()) return "";
      const t = typeOf(r);
      return t ? `## ${t.toUpperCase()}\n${text.trim()}` : text.trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join("\n\n") : null;
}