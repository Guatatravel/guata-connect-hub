/**
 * Base de conhecimento local (por conta) — server-only.
 * Extrai texto de PDF, Word, planilhas, texto puro e links.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeOutboundUrl } from "@/lib/session-sent-urls.server";

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
  content: string;
  whatsapp_sendable: boolean;
  send_keywords: string[];
  whatsapp_caption: string | null;
}

function linkBodyWithUrl(text: string, url: string): string {
  const base = clean(text);
  const u = url.trim();
  if (!u) return base;
  if (base.toLowerCase().includes(u.toLowerCase())) return base;
  return clean(`${base}\n\nLink para o cliente: ${u}`);
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

function isImageFilename(filename: string): boolean {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return IMAGE_EXT.has(ext);
}

function isPdfPath(pathOrName: string): boolean {
  return pathOrName.toLowerCase().endsWith(".pdf");
}

export function buildKnowledgeStoragePath(userId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-]/g, "_").slice(0, 120) || "arquivo";
  return `${userId}/${Date.now()}-${safe}`;
}

export function assertKnowledgeStoragePathOwned(storagePath: string, userId: string): void {
  const prefix = `${userId}/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes("..")) {
    throw new Error("Caminho de arquivo inválido.");
  }
}

type KnowledgeFileInsertOpts = {
  whatsappSendable?: boolean;
  keywords?: string[];
  caption?: string;
  description?: string;
};

async function insertKnowledgeFileRecord(
  userId: string,
  organizationId: string,
  path: string,
  binary: Uint8Array,
  filename: string,
  title?: string,
  opts?: KnowledgeFileInsertOpts,
): Promise<void> {
  if (binary.length === 0) {
    throw new Error("Arquivo vazio. Envie o PDF de novo.");
  }

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
      if (isPdfPath(filename)) {
        status = "pronto";
        content = clean(title?.trim() || "Mapa ou documento em PDF");
        err = null;
      } else {
        status = "erro";
        err = e instanceof Error ? e.message : String(e);
      }
    }
  }

  if (opts?.description?.trim() && isPdfPath(filename) && status === "pronto") {
    content = clean(opts.description.trim());
  }

  const pdfSendable =
    source_type === "arquivo" &&
    isPdfPath(filename) &&
    Boolean(opts?.whatsappSendable) &&
    status === "pronto";

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
    ...(pdfSendable
      ? {
          whatsapp_sendable: true,
          send_keywords: (opts?.keywords ?? [])
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
          whatsapp_caption: opts?.caption?.trim().slice(0, 1024) || null,
        }
      : {}),
  });
  if (error) throw new Error(error.message);
}

/** Cliente pede arquivo (mapa, PDF, envio). */
export function clientWantsKnowledgeFile(userText: string): boolean {
  return /\b(mapa|pdf|arquivo|folheto|cartaz|anexo)\b/i.test(userText) ||
    /\b(mand(ar|e)|envi(ar|e)|manda)\b.*\b(mapa|pdf|arquivo|folheto)\b/i.test(userText) ||
    /\b(mapa|pdf|arquivo)\b.*\b(aqui|whatsapp|chat|por\s+aqui)\b/i.test(userText);
}

function isCommercialAgencyUrl(url: string): boolean {
  return /agenciaguata\.com/i.test(url);
}

function linkKeywordHit(userText: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const q = userText.toLowerCase();
  return keywords.some((kw) => kw.length > 0 && q.includes(kw.toLowerCase()));
}

function mapDocumentBoost(userText: string, title: string, keywords: string[]): number {
  if (!/\bmapa\b/i.test(userText)) return 0;
  let b = 0;
  const hay = `${title} ${keywords.join(" ")}`.toLowerCase();
  if (hay.includes("mapa")) b += 4;
  if (/\b(campo\s*grande|cg)\b/i.test(userText) && hay.includes("campo")) b += 3;
  return b;
}

export function knowledgeFileDelivery(
  filePath: string,
): "image" | "document" | "unsupported" {
  const lower = filePath.toLowerCase();
  if (IMAGE_EXT.has(lower.split(".").pop() ?? "")) return "image";
  if (isPdfPath(lower)) return "document";
  return "unsupported";
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
    content: String(d.content ?? ""),
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

export async function uploadKnowledgeObject(
  path: string,
  binary: Uint8Array,
  contentType?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.storage.from("knowledge").upload(path, binary, {
    upsert: true,
    ...(contentType ? { contentType } : {}),
  });
  if (error) throw new Error(`Falha ao salvar arquivo no storage: ${error.message}`);
}

export async function downloadKnowledgeMediaBytes(
  filePath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from("knowledge").download(filePath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedKnowledgeMediaUrlForDoc(
  docId: string,
  organizationId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("file_path")
    .eq("id", docId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const path = data?.file_path as string | undefined;
  if (!path) return null;
  return signedKnowledgeMediaUrl(path);
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
  opts?: { whatsappSendable?: boolean; keywords?: string[] },
): Promise<void> {
  let content = "";
  let status = "pronto";
  let err: string | null = null;
  try {
    const scraped = await extractFromUrl(url);
    content = linkBodyWithUrl(scraped || title || "", url);
    if (!scraped) {
      status = "pronto";
      err = null;
    }
  } catch (e) {
    content = linkBodyWithUrl(title || "", url);
    status = "pronto";
    err = null;
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
    whatsapp_sendable: opts?.whatsappSendable ?? true,
    send_keywords: (opts?.keywords ?? []).map((k) => k.trim().toLowerCase()).filter(Boolean),
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeFile(
  userId: string,
  organizationId: string,
  filename: string,
  base64: string,
  title?: string,
  opts?: KnowledgeFileInsertOpts,
): Promise<void> {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (binary.length === 0) {
    throw new Error(
      "O servidor não recebeu o arquivo (limite de upload). Tente de novo; o painel envia direto ao Storage.",
    );
  }
  const path = buildKnowledgeStoragePath(userId, filename);
  const pdfMime = isPdfPath(filename) ? "application/pdf" : undefined;
  await uploadKnowledgeObject(path, binary, pdfMime);
  await insertKnowledgeFileRecord(userId, organizationId, path, binary, filename, title, opts);
}

/** Arquivo já enviado ao bucket pelo navegador (evita base64 na server function). */
export async function addKnowledgeFileFromStorage(
  userId: string,
  organizationId: string,
  storagePath: string,
  filename: string,
  title?: string,
  opts?: KnowledgeFileInsertOpts,
): Promise<void> {
  assertKnowledgeStoragePathOwned(storagePath, userId);
  const binary = await downloadKnowledgeMediaBytes(storagePath);
  if (!binary || binary.length === 0) {
    throw new Error(
      "Arquivo não encontrado no storage ou está vazio. Confira o bucket knowledge e envie de novo.",
    );
  }
  await insertKnowledgeFileRecord(
    userId,
    organizationId,
    storagePath,
    binary,
    filename,
    title,
    opts,
  );
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

export async function getKnowledgeDoc(
  id: string,
  organizationId: string,
): Promise<KnowledgeDoc | null> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_documents")
    .select(
      "id,title,source_type,url,file_path,status,error,size_bytes,created_at,content,whatsapp_sendable,send_keywords,whatsapp_caption",
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id as string,
    title: data.title as string,
    source_type: data.source_type as string,
    url: (data.url as string) ?? null,
    file_path: (data.file_path as string) ?? null,
    status: data.status as string,
    error: (data.error as string) ?? null,
    size_bytes: (data.size_bytes as number) ?? 0,
    created_at: data.created_at as string,
    preview: String(data.content ?? "").slice(0, 240),
    content: String(data.content ?? ""),
    whatsapp_sendable: Boolean(data.whatsapp_sendable),
    send_keywords: Array.isArray(data.send_keywords)
      ? (data.send_keywords as string[]).map(String)
      : [],
    whatsapp_caption: (data.whatsapp_caption as string) ?? null,
  };
}

export type KnowledgeUpdateInput = {
  id: string;
  organizationId: string;
  userId?: string;
  title?: string;
  content?: string;
  url?: string;
  refreshLink?: boolean;
  keywords?: string[];
  caption?: string;
  whatsappSendable?: boolean;
  imageBase64?: string;
  imageFilename?: string;
  replaceStoragePath?: string;
  replaceFilename?: string;
};

export async function updateKnowledgeDocument(input: KnowledgeUpdateInput): Promise<void> {
  const existing = await getKnowledgeDoc(input.id, input.organizationId);
  if (!existing) throw new Error("Documento não encontrado.");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160) || existing.title;

  if (existing.source_type === "texto" && input.content !== undefined) {
    const text = clean(input.content);
    if (!text) throw new Error("Conteúdo vazio");
    patch.content = text;
    patch.size_bytes = text.length;
    patch.status = "pronto";
    patch.error = null;
  }

  if (existing.source_type === "link") {
    const url = (input.url ?? existing.url ?? "").trim();
    if (!url) throw new Error("URL inválida");
    patch.url = url;
    if (input.refreshLink) {
      let scraped = "";
      try {
        scraped = await extractFromUrl(url);
      } catch {
        scraped = "";
      }
      patch.content = linkBodyWithUrl(scraped || String(patch.title ?? existing.title), url);
      patch.status = "pronto";
      patch.error = null;
    } else if (input.content !== undefined) {
      patch.content = linkBodyWithUrl(input.content, url);
    } else if (input.url !== undefined) {
      patch.content = linkBodyWithUrl(existing.content, url);
    }
    if (input.whatsappSendable !== undefined) patch.whatsapp_sendable = input.whatsappSendable;
    if (input.keywords !== undefined) {
      patch.send_keywords = input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    }
  }

  if (existing.source_type === "imagem") {
    if (input.content !== undefined) {
      const text = clean(input.content);
      if (!text) throw new Error("Descrição vazia");
      patch.content = text;
    }
    if (input.caption !== undefined) patch.whatsapp_caption = input.caption.slice(0, 1024) || null;
    if (input.whatsappSendable !== undefined) patch.whatsapp_sendable = input.whatsappSendable;
    if (input.keywords !== undefined) {
      patch.send_keywords = input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
    }
    if (input.imageBase64 && input.imageFilename) {
      const binary = Uint8Array.from(atob(input.imageBase64), (c) => c.charCodeAt(0));
      if (!isImageFilename(input.imageFilename)) throw new Error("Use PNG, JPG ou WebP.");
      const path = `${input.organizationId}/${Date.now()}-${input.imageFilename.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabaseAdmin.storage.from("knowledge").upload(path, binary, {
        upsert: true,
      });
      if (upErr) throw new Error(upErr.message);
      if (existing.file_path) {
        await supabaseAdmin.storage.from("knowledge").remove([existing.file_path]).catch(() => undefined);
      }
      patch.file_path = path;
      patch.size_bytes = binary.length;
    }
  }

  if (existing.source_type === "arquivo") {
    if (input.title !== undefined) patch.title = input.title.trim().slice(0, 160);
    const path = existing.file_path ?? "";
    if (isPdfPath(path) || isPdfPath(existing.title)) {
      if (input.content !== undefined) {
        const text = clean(input.content);
        if (text) patch.content = text;
      }
      if (input.whatsappSendable !== undefined) patch.whatsapp_sendable = input.whatsappSendable;
      if (input.keywords !== undefined) {
        patch.send_keywords = input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);
      }
      if (input.caption !== undefined) {
        patch.whatsapp_caption = input.caption.slice(0, 1024) || null;
      }
      if (input.replaceStoragePath && input.replaceFilename && input.userId) {
        assertKnowledgeStoragePathOwned(input.replaceStoragePath, input.userId);
        const binary = await downloadKnowledgeMediaBytes(input.replaceStoragePath);
        if (!binary?.length) {
          throw new Error("Novo PDF não encontrado no storage. Envie o arquivo de novo.");
        }
        if (existing.file_path && existing.file_path !== input.replaceStoragePath) {
          await supabaseAdmin.storage
            .from("knowledge")
            .remove([existing.file_path])
            .catch(() => undefined);
        }
        patch.file_path = input.replaceStoragePath;
        patch.size_bytes = binary.length;
        patch.status = "pronto";
        patch.error = null;
        if (input.content === undefined) {
          try {
            const extracted = await extractFromFile(input.replaceFilename, binary);
            if (extracted) patch.content = extracted;
          } catch {
            /* mantém descrição manual */
          }
        }
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("knowledge_documents")
    .update(patch as never)
    .eq("id", input.id)
    .eq("organization_id", input.organizationId);
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
    .select("title,content,url,source_type")
    .eq("status", "pronto")
    .limit(100);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q;

  const scored = (data ?? [])
    .map((doc) => {
      const url = String(doc.url ?? "").trim();
      const raw = String(doc.content ?? "");
      const content =
        doc.source_type === "link" && url
          ? linkBodyWithUrl(raw, url)
          : raw;
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
  delivery: "image" | "document";
  filename: string;
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
  const file_path = data.file_path as string;
  const delivery = knowledgeFileDelivery(file_path);
  if (delivery === "unsupported") return null;
  const filename = file_path.split("/").pop() ?? "arquivo.pdf";
  return {
    id: data.id as string,
    title: String(data.title ?? ""),
    file_path,
    caption: (data.whatsapp_caption as string) ?? null,
    score: 99,
    delivery,
    filename,
  };
}

export async function pickSendableKnowledgeMedia(
  userText: string,
  organizationId: string,
  minScore = 2,
): Promise<SendableKnowledgeMedia | null> {
  const wantsFile = clientWantsKnowledgeFile(userText);
  const effectiveMin = wantsFile ? 1 : minScore;
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
      const file_path = String(d.file_path ?? "");
      const delivery = knowledgeFileDelivery(file_path);
      if (delivery === "unsupported") return null;
      const keywords = Array.isArray(d.send_keywords)
        ? (d.send_keywords as string[])
        : [];
      const title = String(d.title ?? "");
      const score =
        scoreSendableMatch(userText, {
          title,
          content: String(d.content ?? ""),
          send_keywords: keywords,
        }) + mapDocumentBoost(userText, title, keywords);
      return {
        id: d.id as string,
        title,
        file_path,
        caption: (d.whatsapp_caption as string) ?? null,
        score,
        delivery,
        filename: file_path.split("/").pop() ?? "arquivo",
      };
    })
    .filter(
      (d): d is SendableKnowledgeMedia =>
        d !== null && d.score >= effectiveMin,
    )
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

export async function pickSendableKnowledgeLink(
  userText: string,
  organizationId: string,
  minScore = 2,
  excludeUrls: Set<string> = new Set(),
): Promise<{ title: string; url: string } | null> {
  if (clientWantsKnowledgeFile(userText)) return null;

  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("title,content,url,send_keywords")
    .eq("organization_id", organizationId)
    .eq("status", "pronto")
    .eq("source_type", "link")
    .eq("whatsapp_sendable", true)
    .not("url", "is", null)
    .limit(40);

  const ranked = (data ?? [])
    .map((d) => {
      const url = String(d.url ?? "").trim();
      if (!url) return null;
      const keywords = Array.isArray(d.send_keywords) ? (d.send_keywords as string[]) : [];
      const score = scoreSendableMatch(userText, {
        title: String(d.title ?? ""),
        content: `${String(d.content ?? "")} ${url}`,
        send_keywords: keywords,
      });
      return {
        title: String(d.title ?? ""),
        url,
        score,
        keywords,
      };
    })
    .filter((d): d is { title: string; url: string; score: number; keywords: string[] } => {
      if (d === null || d.score < minScore) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  const commercialIntent =
    /\b(pacote|orçamento|orcamento|reservar|comprar|contratar|agência|agencia|viagem\s+sob\s+medida)\b/i.test(
      userText,
    );

  for (const top of ranked) {
    const norm = normalizeOutboundUrl(top.url);
    if (excludeUrls.has(norm)) continue;
    if (isCommercialAgencyUrl(top.url) && !commercialIntent) continue;
    if (top.keywords.length > 0 && !linkKeywordHit(userText, top.keywords)) continue;
    if (top.keywords.length === 0 && isCommercialAgencyUrl(top.url)) continue;
    return { title: top.title, url: top.url };
  }
  return null;
}

export async function listSendableKnowledgeForPrompt(
  organizationId: string,
): Promise<Array<{ id: string; title: string; hint: string; kind: "image" | "pdf" }>> {
  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id,title,content,send_keywords,source_type,file_path")
    .eq("organization_id", organizationId)
    .eq("status", "pronto")
    .eq("whatsapp_sendable", true)
    .limit(12);
  return (data ?? [])
    .map((d) => {
      const file_path = String(d.file_path ?? "");
      const delivery =
        d.source_type === "imagem" || knowledgeFileDelivery(file_path) === "image"
          ? "image"
          : knowledgeFileDelivery(file_path) === "document"
            ? "pdf"
            : null;
      if (!delivery) return null;
      const kws = Array.isArray(d.send_keywords) ? (d.send_keywords as string[]).join(", ") : "";
      return {
        id: d.id as string,
        title: String(d.title ?? ""),
        hint: [String(d.content ?? "").slice(0, 120), kws ? `Palavras: ${kws}` : ""]
          .filter(Boolean)
          .join(" — "),
        kind: delivery,
      };
    })
    .filter((x): x is { id: string; title: string; hint: string; kind: "image" | "pdf" } => x !== null);
}
