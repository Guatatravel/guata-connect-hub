/**
 * Base de conhecimento local (por conta) — server-only.
 * Extrai texto de PDF, Word, planilhas, texto puro e links.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_CONTENT = 200_000;

function clean(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CONTENT);
}

function stripHtml(html: string): string {
  return clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

export async function extractFromFile(
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  if (["txt", "md", "csv", "json"].includes(ext)) {
    return clean(new TextDecoder().decode(bytes));
  }

  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return clean(Array.isArray(text) ? text.join("\n") : text);
  }

  if (ext === "docx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes);
    const doc = files["word/document.xml"];
    if (!doc) throw new Error("Documento Word inválido");
    const xml = strFromU8(doc);
    return clean(
      xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<[^>]+>/g, ""),
    );
  }

  if (["xlsx", "xls"].includes(ext)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      parts.push(`# ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`);
    }
    return clean(parts.join("\n\n"));
  }

  throw new Error(`Formato não suportado: .${ext}`);
}

export async function extractFromUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "GuataChannel/1.0 (+knowledge-import)" },
  });
  if (!res.ok) throw new Error(`Não foi possível ler o link (${res.status})`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return extractFromFile("arquivo.pdf", buf);
  }
  return stripHtml(await res.text());
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  source_type: string;
  url: string | null;
  file_path: string | null;
  status: string;
  error: string | null;
  size_bytes: number;
  created_at: string;
  preview: string;
  whatsapp_sendable: boolean;
  send_keywords: string[];
  whatsapp_caption: string | null;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function isImageFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXT.has(ext);
}

export async function listKnowledgeDocs(organizationId: string): Promise<KnowledgeDoc[]> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_documents")
    .select(
      "id,title,source_type,url,file_path,status,error,size_bytes,created_at,content,whatsapp_sendable,send_keywords,whatsapp_caption",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    title: d.title as string,
    source_type: d.source_type as string,
    url: (d.url as string) ?? null,
    file_path: (d.file_path as string) ?? null,
    status: d.status as string,
    error: (d.error as string) ?? null,
    size_bytes: (d.size_bytes as number) ?? 0,
    created_at: d.created_at as string,
    preview: String(d.content ?? "").slice(0, 240),
    whatsapp_sendable: Boolean(d.whatsapp_sendable),
    send_keywords: Array.isArray(d.send_keywords)
      ? (d.send_keywords as string[]).map(String)
      : [],
    whatsapp_caption: (d.whatsapp_caption as string) ?? null,
  }));
}

export async function signedKnowledgeMediaUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("knowledge")
    .createSignedUrl(filePath, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function addKnowledgeText(
  userId: string,
  organizationId: string,
  title: string,
  content: string,
): Promise<void> {
  const text = clean(content);
  if (!text) throw new Error("Conteúdo vazio");
  const { error } = await supabaseAdmin.from("knowledge_documents").insert({
    title,
    source_type: "texto",
    content: text,
    size_bytes: text.length,
    status: "pronto",
    created_by: userId,
    organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeLink(
  userId: string,
  organizationId: string,
  title: string,
  url: string,
): Promise<void> {
  let content = "";
  let status = "pronto";
  let err: string | null = null;
  try {
    content = await extractFromUrl(url);
    if (!content) throw new Error("Nenhum texto encontrado no link");
  } catch (e) {
    status = "erro";
    err = e instanceof Error ? e.message : String(e);
  }
  const { error } = await supabaseAdmin.from("knowledge_documents").insert({
    title: title || url,
    source_type: "link",
    url,
    content,
    size_bytes: content.length,
    status,
    error: err,
    created_by: userId,
    organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeFile(
  userId: string,
  organizationId: string,
  filename: string,
  base64: string,
  title?: string,
): Promise<void> {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${userId}/${Date.now()}-${filename.replace(/[^\w.\-]/g, "_")}`;

  let content = "";
  let status = "pronto";
  let err: string | null = null;
  let source_type = "arquivo";

  if (isImageFilename(filename)) {
    source_type = "imagem";
    content = clean(title ?? filename);
    if (!content) content = "Imagem promocional";
  } else {
    try {
      content = await extractFromFile(filename, binary);
      if (!content) throw new Error("Nenhum texto legível encontrado no arquivo");
    } catch (e) {
      status = "erro";
      err = e instanceof Error ? e.message : String(e);
    }
  }

  await supabaseAdmin.storage
    .from("knowledge")
    .upload(path, binary, { upsert: true })
    .catch(() => undefined);

  const { error } = await supabaseAdmin.from("knowledge_documents").insert({
    title: title || filename,
    source_type,
    file_path: path,
    content,
    size_bytes: binary.length,
    status,
    error: err,
    created_by: userId,
    organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeWhatsAppImage(
  userId: string,
  organizationId: string,
  input: {
    filename: string;
    base64: string;
    title: string;
    description: string;
    keywords: string[];
    caption: string;
    sendable: boolean;
  },
): Promise<void> {
  const binary = Uint8Array.from(atob(input.base64), (c) => c.charCodeAt(0));
  if (!isImageFilename(input.filename)) {
    throw new Error("Use PNG, JPG ou WebP.");
  }
  const path = `${userId}/${Date.now()}-${input.filename.replace(/[^\w.\-]/g, "_")}`;
  const content = clean(
    [input.title, input.description].filter(Boolean).join("\n\n"),
  );
  if (!content) throw new Error("Informe título ou descrição para a IA encontrar esta imagem.");

  const { error: upErr } = await supabaseAdmin.storage
    .from("knowledge")
    .upload(path, binary, { upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { error } = await supabaseAdmin.from("knowledge_documents").insert({
    title: input.title.slice(0, 160) || input.filename,
    source_type: "imagem",
    file_path: path,
    content,
    size_bytes: binary.length,
    status: "pronto",
    created_by: userId,
    organization_id: organizationId,
    whatsapp_sendable: input.sendable,
    send_keywords: input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 30),
    whatsapp_caption: input.caption.slice(0, 1024) || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  const path = data?.file_path as string | undefined;
  if (path) {
    await supabaseAdmin.storage.from("knowledge").remove([path]).catch(() => undefined);
  }
  const { error } = await supabaseAdmin.from("knowledge_documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Busca trechos relevantes na base local para alimentar a IA. */
export async function searchLocalKnowledge(
  query: string,
  limit = 3,
  organizationId?: string,
): Promise<Array<{ title: string; excerpt: string }>> {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);
  if (terms.length === 0) return [];

  let q = supabaseAdmin
    .from("knowledge_documents")
    .select("title,content")
    .eq("status", "pronto")
    .limit(100);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q;

  const scored = (data ?? [])
    .map((doc) => {
      const content = String(doc.content ?? "");
      const lower = content.toLowerCase();
      let score = 0;
      let firstHit = -1;
      for (const t of terms) {
        const idx = lower.indexOf(t);
        if (idx >= 0) {
          score += 1;
          if (firstHit < 0) firstHit = idx;
        }
      }
      const start = Math.max(0, (firstHit < 0 ? 0 : firstHit) - 200);
      return {
        title: String(doc.title ?? ""),
        excerpt: content.slice(start, start + 1200),
        score,
      };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ title, excerpt }) => ({ title, excerpt }));
}

export interface SendableKnowledgeMedia {
  id: string;
  title: string;
  file_path: string;
  caption: string | null;
  score: number;
}

function scoreSendableMatch(
  query: string,
  doc: {
    title: string;
    content: string;
    send_keywords: string[];
  },
): number {
  const q = query.toLowerCase();
  const terms = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  let score = 0;
  const hay = `${doc.title} ${doc.content}`.toLowerCase();
  for (const kw of doc.send_keywords) {
    if (kw && q.includes(kw.toLowerCase())) score += 3;
  }
  for (const t of terms) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

/** Mídias marcadas como enviáveis no WhatsApp, ranqueadas pelo texto do cliente. */
export async function getSendableKnowledgeMediaById(
  id: string,
  organizationId: string,
): Promise<SendableKnowledgeMedia | null> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id,title,file_path,whatsapp_caption")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .eq("status", "pronto")
    .eq("whatsapp_sendable", true)
    .not("file_path", "is", null)
    .maybeSingle();
  if (!data?.file_path) return null;
  return {
    id: data.id as string,
    title: String(data.title ?? ""),
    file_path: data.file_path as string,
    caption: (data.whatsapp_caption as string) ?? null,
    score: 99,
  };
}

export async function pickSendableKnowledgeMedia(
  userText: string,
  organizationId: string,
  minScore = 2,
): Promise<SendableKnowledgeMedia | null> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id,title,content,file_path,whatsapp_caption,send_keywords")
    .eq("organization_id", organizationId)
    .eq("status", "pronto")
    .eq("whatsapp_sendable", true)
    .not("file_path", "is", null)
    .limit(50);

  const ranked = (data ?? [])
    .map((d) => {
      const keywords = Array.isArray(d.send_keywords)
        ? (d.send_keywords as string[])
        : [];
      const score = scoreSendableMatch(userText, {
        title: String(d.title ?? ""),
        content: String(d.content ?? ""),
        send_keywords: keywords,
      });
      return {
        id: d.id as string,
        title: String(d.title ?? ""),
        file_path: d.file_path as string,
        caption: (d.whatsapp_caption as string) ?? null,
        score,
      };
    })
    .filter((d) => d.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

export async function listSendableKnowledgeForPrompt(
  organizationId: string,
): Promise<Array<{ id: string; title: string; hint: string }>> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id,title,content,send_keywords")
    .eq("organization_id", organizationId)
    .eq("status", "pronto")
    .eq("whatsapp_sendable", true)
    .limit(12);
  return (data ?? []).map((d) => {
    const kws = Array.isArray(d.send_keywords) ? (d.send_keywords as string[]).join(", ") : "";
    return {
      id: d.id as string,
      title: String(d.title ?? ""),
      hint: [String(d.content ?? "").slice(0, 120), kws ? `Palavras: ${kws}` : ""]
        .filter(Boolean)
        .join(" — "),
    };
  });
}
