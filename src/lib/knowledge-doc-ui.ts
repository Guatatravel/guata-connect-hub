/** Filtros da lista de conhecimento no painel (client-safe). */

export type KnowledgeListFilter =
  | "all"
  | "link"
  | "pdf"
  | "texto"
  | "imagem"
  | "arquivo";

export function isKnowledgePdf(doc: {
  source_type: string;
  title: string;
  file_path?: string | null;
}): boolean {
  if (doc.source_type !== "arquivo") return false;
  const hay = `${doc.title} ${doc.file_path ?? ""}`.toLowerCase();
  return hay.includes(".pdf");
}

/** Título legível a partir do nome do arquivo (sem .pdf e sufixos tipo " 1"). */
export function defaultKnowledgeTitleFromFilename(filename: string): string {
  let base = filename.replace(/\.[^.]+$/i, "");
  base = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  base = base.replace(/\s+\d+$/i, "").trim();
  if (!base) return "Documento";
  return base.slice(0, 160);
}

export function matchesKnowledgeListFilter(
  doc: { source_type: string; title: string; file_path?: string | null },
  filter: KnowledgeListFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "link") return doc.source_type === "link";
  if (filter === "texto") return doc.source_type === "texto";
  if (filter === "imagem") return doc.source_type === "imagem";
  if (filter === "pdf") return isKnowledgePdf(doc);
  if (filter === "arquivo") {
    return doc.source_type === "arquivo" && !isKnowledgePdf(doc);
  }
  return true;
}
