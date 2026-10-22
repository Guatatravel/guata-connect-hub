import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveOrganizationForUser } from "@/lib/organizations.server";

export const listKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { listKnowledgeDocs } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    return listKnowledgeDocs(orgId);
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
    const orgId = await resolveOrganizationForUser(context.userId);
    await addKnowledgeText(context.userId, orgId, data.title || "Texto sem título", data.content);
    return { ok: true };
  });

export const addKnowledgeLinkDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { title: string; url: string; keywords?: string; sendable?: boolean }) => ({
    title: String(input?.title ?? "").slice(0, 160),
    url: String(input?.url ?? "").slice(0, 2000),
    keywords: String(input?.keywords ?? ""),
    sendable: input?.sendable !== false,
  }))
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { addKnowledgeLink } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    if (!/^https?:\/\//i.test(data.url)) throw new Error("Informe um link válido (http ou https)");
    const keywords = data.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    await addKnowledgeLink(context.userId, orgId, data.title, data.url, {
      whatsappSendable: data.sendable,
      keywords,
    });
    return { ok: true };
  });

export const updateKnowledgeDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id: string;
      title?: string;
      content?: string;
      url?: string;
      refreshLink?: boolean;
      keywords?: string;
      caption?: string;
      sendable?: boolean;
      imageBase64?: string;
      imageFilename?: string;
    }) => ({
      id: String(input?.id ?? ""),
      title: input?.title !== undefined ? String(input.title).slice(0, 160) : undefined,
      content: input?.content !== undefined ? String(input.content) : undefined,
      url: input?.url !== undefined ? String(input.url).slice(0, 2000) : undefined,
      refreshLink: Boolean(input?.refreshLink),
      keywords: input?.keywords !== undefined ? String(input.keywords) : undefined,
      caption: input?.caption !== undefined ? String(input.caption).slice(0, 1024) : undefined,
      sendable: input?.sendable !== undefined ? Boolean(input.sendable) : undefined,
      imageBase64: input?.imageBase64 ? String(input.imageBase64) : undefined,
      imageFilename: input?.imageFilename ? String(input.imageFilename) : undefined,
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { updateKnowledgeDocument } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const keywords =
      data.keywords !== undefined
        ? data.keywords.split(",").map((k) => k.trim()).filter(Boolean)
        : undefined;
    await updateKnowledgeDocument({
      id: data.id,
      organizationId: orgId,
      title: data.title,
      content: data.content,
      url: data.url,
      refreshLink: data.refreshLink,
      keywords,
      caption: data.caption,
      whatsappSendable: data.sendable,
      imageBase64: data.imageBase64,
      imageFilename: data.imageFilename,
    });
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
    const orgId = await resolveOrganizationForUser(context.userId);
    await addKnowledgeFile(
      context.userId,
      orgId,
      data.filename,
      data.base64,
      data.title || undefined,
    );
    return { ok: true };
  });

export const addKnowledgeWhatsAppImageDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      filename: string;
      base64: string;
      title: string;
      description: string;
      keywords: string;
      caption: string;
      sendable: boolean;
    }) => ({
      filename: String(input?.filename ?? "imagem.png"),
      base64: String(input?.base64 ?? ""),
      title: String(input?.title ?? "").slice(0, 160),
      description: String(input?.description ?? "").slice(0, 4000),
      keywords: String(input?.keywords ?? ""),
      caption: String(input?.caption ?? "").slice(0, 1024),
      sendable: Boolean(input?.sendable),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffUser } = await import("@/lib/diagnostics.server");
    const { addKnowledgeWhatsAppImage } = await import("@/lib/knowledge.server");
    await requireStaffUser(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const keywords = data.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    await addKnowledgeWhatsAppImage(context.userId, orgId, {
      filename: data.filename,
      base64: data.base64,
      title: data.title,
      description: data.description,
      keywords,
      caption: data.caption,
      sendable: data.sendable,
    });
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
