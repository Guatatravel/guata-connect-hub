import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { listKnowledgeDocs } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    return listKnowledgeDocs();
  });

export const addKnowledgeTextDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; content: string }) => ({
    title: String(input?.title ?? "").slice(0, 160),
    content: String(input?.content ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { addKnowledgeText } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    await addKnowledgeText(context.userId, data.title || "Texto sem título", data.content);
    return { ok: true };
  });

export const addKnowledgeLinkDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; url: string }) => ({
    title: String(input?.title ?? "").slice(0, 160),
    url: String(input?.url ?? "").slice(0, 2000),
  }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { addKnowledgeLink } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    if (!/^https?:\/\//i.test(data.url)) throw new Error("Informe um link válido (http ou https)");
    await addKnowledgeLink(context.userId, data.title, data.url);
    return { ok: true };
  });

export const addKnowledgeFileDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filename: string; base64: string; title?: string }) => ({
    filename: String(input?.filename ?? "arquivo"),
    base64: String(input?.base64 ?? ""),
    title: String(input?.title ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { addKnowledgeFile } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    if (!data.base64) throw new Error("Arquivo vazio");
    await addKnowledgeFile(context.userId, data.filename, data.base64, data.title);
    return { ok: true };
  });

export const removeKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { deleteKnowledgeDoc } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    await deleteKnowledgeDoc(data.id);
    return { ok: true };
  });
