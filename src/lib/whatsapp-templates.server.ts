/**
 * Modelos de mensagem WhatsApp (Meta WABA) — server-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveWhatsAppCredentials } from "@/lib/organizations.server";
import type { TemplateButtonInput, TemplateHeaderMode } from "@/lib/whatsapp-templates.shared";

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

function validateButtons(buttons: TemplateButtonInput[]): TemplateButtonInput[] {
  if (buttons.length > 3) throw new Error("A Meta permite no máximo 3 botões.");
  const hasQuick = buttons.some((b) => b.type === "QUICK_REPLY");
  const hasCta = buttons.some((b) => b.type === "URL" || b.type === "PHONE_NUMBER");
  if (hasQuick && hasCta) {
    throw new Error(
      "Na Meta, use só respostas rápidas OU botões de ação (site/ligar) no mesmo modelo — não misture os dois.",
    );
  }
  return buttons.map((b) => {
    const text = b.text.trim().slice(0, 25);
    if (text.length < 1) throw new Error("Cada botão precisa de um rótulo.");
    if (b.type === "URL") {
      const url = (b.url ?? "").trim();
      if (!/^https:\/\//i.test(url)) throw new Error(`URL inválida no botão “${text}”. Use https://…`);
      return { type: b.type, text, url };
    }
    if (b.type === "PHONE_NUMBER") {
      const phone_number = (b.phoneNumber ?? "").replace(/\D/g, "");
      if (phone_number.length < 10) throw new Error(`Telefone inválido no botão “${text}”.`);
      return { type: b.type, text, phone_number };
    }
    return { type: "QUICK_REPLY" as const, text };
  });
}

async function uploadMetaSampleImage(
  token: string,
  appId: string,
  bytes: Buffer,
  mime: string,
): Promise<string> {
  const fileType = mime.startsWith("image/") ? mime : "image/jpeg";
  const start = await fetch(
    `${GRAPH}/${appId}/uploads?file_length=${bytes.length}&file_type=${encodeURIComponent(fileType)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) },
  );
  if (!start.ok) {
    const t = await start.text().catch(() => "");
    throw new Error(`Meta não aceitou a imagem: ${t.slice(0, 180)}`);
  }
  const started = (await start.json()) as { id?: string };
  const sessionId = started.id;
  if (!sessionId) throw new Error("Meta não iniciou o envio da imagem.");
  const up = await fetch(`${GRAPH}/${sessionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(120000),
  });
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem à Meta: ${t.slice(0, 180)}`);
  }
  const done = (await up.json()) as { h?: string };
  if (!done.h) throw new Error("Meta não devolveu o identificador da imagem.");
  return done.h;
}

async function buildMetaComponents(
  token: string,
  input: {
    bodyText: string;
    headerMode: TemplateHeaderMode;
    headerText?: string;
    headerImageBase64?: string;
    headerImageContentType?: string;
    footerText?: string;
    buttons: TemplateButtonInput[];
  },
): Promise<Array<Record<string, unknown>>> {
  const components: Array<Record<string, unknown>> = [];
  const bodyText = input.bodyText.trim();
  if (bodyText.length < 1 || bodyText.length > 1024) {
    throw new Error("O texto do corpo deve ter entre 1 e 1024 caracteres.");
  }

  if (input.headerMode === "text") {
    const text = input.headerText?.trim().slice(0, 60);
    if (!text) throw new Error("Preencha o texto do cabeçalho.");
    components.push({ type: "HEADER", format: "TEXT", text });
  }
  if (input.headerMode === "image") {
    const b64 = input.headerImageBase64?.trim();
    if (!b64) throw new Error("Envie uma imagem de amostra para o cabeçalho.");
    const appId = process.env.META_APP_ID?.trim();
    if (!appId) throw new Error("META_APP_ID não configurado no servidor.");
    const bytes = Buffer.from(b64, "base64");
    if (bytes.length < 100 || bytes.length > 5 * 1024 * 1024) {
      throw new Error("Imagem inválida (use JPG/PNG até 5 MB).");
    }
    const handle = await uploadMetaSampleImage(
      token,
      appId,
      bytes,
      input.headerImageContentType ?? "image/jpeg",
    );
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [handle] },
    });
  }

  components.push({ type: "BODY", text: bodyText });

  const footer = input.footerText?.trim().slice(0, 60);
  if (footer) components.push({ type: "FOOTER", text: footer });

  const buttons = validateButtons(input.buttons);
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.map((b) => {
        if (b.type === "URL") return { type: "URL", text: b.text, url: (b as { url: string }).url };
        if (b.type === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER",
            text: b.text,
            phone_number: (b as { phone_number: string }).phone_number,
          };
        }
        return { type: "QUICK_REPLY", text: b.text };
      }),
    });
  }

  return components;
}

export async function createWhatsappTemplate(
  organizationId: string,
  input: {
    name: string;
    language: string;
    category: TemplateCategory;
    bodyText: string;
    headerMode?: TemplateHeaderMode;
    headerText?: string;
    headerImageBase64?: string;
    headerImageContentType?: string;
    footerText?: string;
    buttons?: TemplateButtonInput[];
  },
): Promise<void> {
  const { token, wabaId } = await wabaContext(organizationId);
  const name = normalizeName(input.name);
  if (!name) throw new Error("Nome inválido. Use letras, números e _.");

  const components = await buildMetaComponents(token, {
    bodyText: input.bodyText,
    headerMode: input.headerMode ?? (input.headerText?.trim() ? "text" : "none"),
    headerText: input.headerText,
    headerImageBase64: input.headerImageBase64,
    headerImageContentType: input.headerImageContentType,
    footerText: input.footerText,
    buttons: input.buttons ?? [],
  });

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
      body_text: input.bodyText.trim(),
      meta_template_id: created.id ?? null,
      components,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,name,language" },
  );
}