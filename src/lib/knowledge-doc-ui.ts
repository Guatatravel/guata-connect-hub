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
