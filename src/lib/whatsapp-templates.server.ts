/**
 * Modelos de mensagem WhatsApp (Meta WABA) — server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveWhatsAppCredentials } from "@/lib/organizations.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface WhatsappTemplateRow {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  body_text: string;
  meta_template_id: string | null;
  updated_at: string;
}

async function wabaContext(organizationId: string) {
  const { token, phoneId } = await resolveWhatsAppCredentials(organizationId, "descubra");
  if (!token || !phoneId) throw new Error("WhatsApp oficial não conectado. Conecte em Configurações.");
  const { data } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("waba_id")
    .eq("organization_id", organizationId)
    .eq("line", "descubra")
    .eq("is_active", true)
    .maybeSingle();
  const wabaId = (data?.waba_id as string | undefined)?.trim();
  if (!wabaId) throw new Error("WABA não encontrada. Reconecte o número em Conectar Meta.");
  return { token, wabaId };
}

function bodyFromComponents(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const c of components) {
    if (c && typeof c === "object" && "type" in c && (c as { type: string }).type === "BODY" && "text" in c) {
      return String((c as { text: string }).text);
    }
  }
  return "";
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 512);
}

export async function listWhatsappTemplates(organizationId: string): Promise<WhatsappTemplateRow[]> {
  const { data } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("id,name,language,category,status,body_text,meta_template_id,updated_at")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as WhatsappTemplateRow[];
}

export async function syncWhatsappTemplatesFromMeta(organizationId: string): Promise<number> {
  const { token, wabaId } = await wabaContext(organizationId);
  const fields =
    "name,status,language,category,components,id,quality_score,rejected_reason";
  const url = `${GRAPH}/${wabaId}/message_templates?limit=100&fields=${encodeURIComponent(fields)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      status?: string;
      language?: string;
      category?: string;
      components?: unknown;
    }>;
  };
  const rows = json.data ?? [];
  const now = new Date().toISOString();
  for (const item of rows) {
    const name = item.name?.trim();
    const language = item.language?.trim() || "pt_BR";
    if (!name) continue;
    await supabaseAdmin.from("whatsapp_templates").upsert(
      {
        organization_id: organizationId,
        name,
        language,
        category: item.category ?? "MARKETING",
        status: item.status ?? "UNKNOWN",
        body_text: bodyFromComponents(item.components),
        meta_template_id: item.id ?? null,
        components: item.components ?? [],
        updated_at: now,
      },
      { onConflict: "organization_id,name,language" },
    );
  }
  return rows.length;
}

export async function createWhatsappTemplate(
  organizationId: string,
  input: {
    name: string;
    language: string;
    category: TemplateCategory;
    bodyText: string;
    headerText?: string;
  },
): Promise<void> {
  const { token, wabaId } = await wabaContext(organizationId);
  const name = normalizeName(input.name);
  if (!name) throw new Error("Nome inválido. Use letras, números e _.");
  const bodyText = input.bodyText.trim();
  if (bodyText.length < 1 || bodyText.length > 1024) throw new Error("O texto do corpo deve ter entre 1 e 1024 caracteres.");

  const components: Array<Record<string, unknown>> = [{ type: "BODY", text: bodyText }];
  const header = input.headerText?.trim();
  if (header) components.unshift({ type: "HEADER", format: "TEXT", text: header.slice(0, 60) });

  const payload = {
    name,
    language: input.language.trim() || "pt_BR",
    category: input.category,
    components,
  };

  const res = await fetch(`${GRAPH}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Meta recusou o modelo: ${text.slice(0, 280)}`);
  }
  const created = (await res.json()) as { id?: string; status?: string };
  await supabaseAdmin.from("whatsapp_templates").upsert(
    {
      organization_id: organizationId,
      name,
      language: payload.language,
      category: input.category,
      status: created.status ?? "PENDING",
      body_text: bodyText,
      meta_template_id: created.id ?? null,
      components,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,name,language" },
  );
}