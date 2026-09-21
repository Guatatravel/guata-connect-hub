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
}

export async function listKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const { data, error } = await supabaseAdmin
    .from("knowledge_documents")
    .select("id,title,source_type,url,file_path,status,error,size_bytes,created_at,content")
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
  }));
}

export async function addKnowledgeText(
  userId: string,
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
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeLink(
  userId: string,
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
  });
  if (error) throw new Error(error.message);
}

export async function addKnowledgeFile(
  userId: string,
  filename: string,
  base64: string,
  title?: string,
): Promise<void> {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${userId}/${Date.now()}-${filename.replace(/[^\w.\-]/g, "_")}`;

  let content = "";
  let status = "pronto";
  let err: string | null = null;
  try {
    content = await extractFromFile(filename, binary);
    if (!content) throw new Error("Nenhum texto legível encontrado no arquivo");
  } catch (e) {
    status = "erro";
    err = e instanceof Error ? e.message : String(e);
  }

  await supabaseAdmin.storage
    .from("knowledge")
    .upload(path, binary, { upsert: true })
    .catch(() => undefined);

  const { error } = await supabaseAdmin.from("knowledge_documents").insert({
    title: title || filename,
    source_type: "arquivo",
    file_path: path,
    content,
    size_bytes: binary.length,
    status,
    error: err,
    created_by: userId,
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
): Promise<Array<{ title: string; excerpt: string }>> {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);
  if (terms.length === 0) return [];

  const { data } = await supabaseAdmin
    .from("knowledge_documents")
    .select("title,content")
    .eq("status", "pronto")
    .limit(100);

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
