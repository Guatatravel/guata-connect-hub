/**
 * Server functions do painel operacional Guatá Channel.
 * Lê/escreve direto no Supabase via supabaseAdmin, gated por requireSupabaseAuth
 * (qualquer usuário logado da equipe — quem não está em user_roles não passa do _app guard).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  sendWhatsAppDocument,
  sendWhatsAppImage,
  sendWhatsAppText,
  typingDelayMs,
} from "@/lib/meta-send.server";
import {
  signedChatMediaUrl,
  storeChatMediaFromBase64,
} from "@/lib/chat-media.server";
import {
  agentWhatsAppCaption,
  agentWhatsAppParts,
} from "@/lib/whatsapp-messages.server";
import { parseLeadStageFromIntake } from "@/lib/lead-intake.server";
import { resolveOrganizationForUser } from "@/lib/organizations.server";

// --------- mapeamentos DB ↔ UI ---------
type DbLine = "descubra" | "viagens";
type UiLine = "descubra_ms" | "guata_viagens";
const dbToUiLine = (l: DbLine): UiLine =>
  l === "descubra" ? "descubra_ms" : "guata_viagens";
const uiToDbLine = (l: UiLine | string): DbLine =>
  l === "descubra_ms" ? "descubra" : "viagens";

type DbMode = "bot" | "humano" | "triagem" | "aguardando";
type UiMode = "informacional" | "triagem" | "humano" | "aguardando";
const dbToUiMode = (m: DbMode): UiMode => (m === "bot" ? "informacional" : m);

const uiToDbStatusPost = (s: string): "rascunho" | "aprovado" | "publicado" | "arquivado" => {
  if (s === "ignorado") return "arquivado";
  if (["rascunho", "aprovado", "publicado", "arquivado"].includes(s))
    return s as never;
  return "rascunho";
};

// --------- helpers de auth/staff ---------
async function requireStaff(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .limit(1);
  if (!data || data.length === 0) {
    throw new Error("Acesso restrito à equipe.");
  }
}

async function resolveStaffName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle();
  return data?.name?.trim() || data?.email || null;
}

// =========================================================
// DASHBOARD
// =========================================================
export const fetchDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [triagensHojeRes, abertasRes, humanoRes, sessoesRes, postsRes, ultimasRes, leadSessionsRes] =
      await Promise.all([
        supabaseAdmin
          .from("travel_intake")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayIso),
        supabaseAdmin
          .from("travel_intake")
          .select("id", { count: "exact", head: true })
          .in("status", ["aberta", "novo"]),
        supabaseAdmin
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .eq("mode", "humano"),
        supabaseAdmin
          .from("sessions")
          .select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("channel_posts")
          .select("id", { count: "exact", head: true })
          .eq("status", "rascunho"),
        supabaseAdmin
          .from("travel_intake")
          .select(
            "id, protocol, destino, origem, status, assigned_to, created_at, updated_at, session_id, adultos, criancas, orcamento_brl, data_ida, data_volta",
          )
          .order("created_at", { ascending: false })
          .limit(5),
        supabaseAdmin
          .from("sessions")
          .select("intake_data")
          .is("archived_at", null)
          .limit(400),
      ]);

    const leadsQuentes = (leadSessionsRes.data ?? []).filter((row) => {
      const stage = parseLeadStageFromIntake((row.intake_data ?? {}) as Record<string, unknown>);
      return stage === "quente" || stage === "qualificando";
    }).length;

    const sessionIds = (ultimasRes.data ?? []).map((t) => t.session_id);
    const { data: sess } = sessionIds.length
      ? await supabaseAdmin
          .from("sessions")
          .select("id, contact_name, phone, line")
          .in("id", sessionIds)
      : { data: [] as Array<{ id: string; contact_name: string | null; phone: string; line: DbLine }> };
    const sessMap = new Map((sess ?? []).map((s) => [s.id, s]));

    const ultimas = (ultimasRes.data ?? []).map((t) => {
      const s = sessMap.get(t.session_id);
      return {
        id: t.id,
        protocol: t.protocol,
        name: s?.contact_name ?? s?.phone ?? "—",
        phone: s?.phone ?? "",
        line: s ? dbToUiLine(s.line) : "descubra_ms",
        destino: t.destino ?? "—",
        dataIda: t.data_ida ?? "",
        dataVolta: t.data_volta ?? "",
        viajantes: (t.adultos ?? 0) + (t.criancas ?? 0),
        faixaOrcamento: t.orcamento_brl
          ? `R$ ${Number(t.orcamento_brl).toLocaleString("pt-BR")}`
          : "Sem definir",
        status: t.status === "aberta" ? "novo" : t.status,
        assignedTo: t.assigned_to ?? undefined,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    return {
      triagensHoje: triagensHojeRes.count ?? 0,
      aguardandoConsultor: abertasRes.count ?? 0,
      emAtendimentoHumano: humanoRes.count ?? 0,
      conversasAtivas: sessoesRes.count ?? 0,
      leadsQuentes,
      postsPendentes: postsRes.count ?? 0,
      ultimasTriagens: ultimas,
    };
  });

type MessageMeta = {
  media_path?: string;
  media_mime?: string;
  media_kind?: string;
  filename?: string;
};

async function mapMessagesForPanel(
  msgs: Array<{
    id: string;
    author: string;
    text: string;
    created_at: string;
    metadata: unknown;
  }>,
) {
  const nameCache = new Map<string, string | null>();
  return Promise.all(
    msgs.map(async (m) => {
      const meta = (m.metadata ?? {}) as MessageMeta & { sent_by?: string };
      const path = meta.media_path;
      const mediaUrl = path ? await signedChatMediaUrl(path) : null;
      const mediaKind = meta.media_kind as "image" | "audio" | "video" | "document" | undefined;
      let authorName: string | undefined;
      if (m.author === "agent" && meta.sent_by) {
        if (!nameCache.has(meta.sent_by)) nameCache.set(meta.sent_by, await resolveStaffName(meta.sent_by));
        authorName = nameCache.get(meta.sent_by) ?? undefined;
      }
      return {
        id: m.id,
        role: (m.author === "user" ? "user" : m.author === "bot" ? "bot" : "human") as
          | "user"
          | "bot"
          | "human",
        authorName,
        text: m.text,
        at: m.created_at,
        mediaKind,
        mediaUrl: mediaUrl ?? undefined,
        mediaMime: meta.media_mime,
        mediaFilename: meta.filename,
      };
    }),
  );
}

// =========================================================
// CONVERSAS / MENSAGENS
// =========================================================
export const fetchConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    const { data } = await supabaseAdmin
      .from("sessions")
      .select(
        "id, line, mode, phone, contact_name, last_message_at, created_at, archived_at, staff_seen_at, intake_data",
      )
      .eq("organization_id", orgId)
      .order("last_message_at", { ascending: false })
      .limit(200);

    const sessIds = (data ?? []).map((s) => s.id);
    const lastMsgByConv = new Map<string, string>();
    if (sessIds.length) {
      const { data: msgs } = await supabaseAdmin
        .from("messages")
        .select("session_id, text, created_at")
        .in("session_id", sessIds)
        .order("created_at", { ascending: false })
        .limit(500);
      for (const m of msgs ?? []) {
        if (!lastMsgByConv.has(m.session_id)) lastMsgByConv.set(m.session_id, m.text);
      }
    }

    return (data ?? []).map((s) => {
      const intake = (s.intake_data ?? {}) as Record<string, unknown>;
      return {
        id: s.id,
        phone: s.phone,
        contactName: s.contact_name ?? undefined,
        line: dbToUiLine(s.line),
        mode: dbToUiMode(s.mode),
        lastMessageAt: s.last_message_at,
        lastMessage: lastMsgByConv.get(s.id) ?? "",
        archived: Boolean(s.archived_at),
        unseen: !s.staff_seen_at || s.staff_seen_at < s.last_message_at,
        leadStage: parseLeadStageFromIntake(intake),
        triagemProtocol:
          typeof intake["triagem_protocol"] === "string"
            ? intake["triagem_protocol"]
            : undefined,
        messages: [],
      };
    });
  });

export const setConversationArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    await supabaseAdmin
      .from("sessions")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });

/** Inicia (ou reabre) conversa com um número informado pelo consultor. */
export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ phone: z.string().min(8).max(20), name: z.string().max(120).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    let phone = data.phone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = "55" + phone;
    if (phone.length < 12) throw new Error("Telefone inválido. Use DDD + número.");
    const { data: existing } = await supabaseAdmin
      .from("sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone", phone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("sessions")
        .update({
          archived_at: null,
          ...(data.name?.trim() ? { contact_name: data.name.trim() } : {}),
        })
        .eq("id", existing.id);
      return { id: existing.id as string };
    }
    const { data: created, error } = await supabaseAdmin
      .from("sessions")
      .insert({
        phone,
        line: "descubra",
        organization_id: orgId,
        contact_name: data.name?.trim() || null,
        mode: "humano",
        assigned_to: context.userId,
        staff_seen_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

export const fetchConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const { data: s } = await supabaseAdmin
      .from("sessions")
      .select(
        "id, line, mode, phone, contact_name, last_message_at, created_at, assigned_to, intake_data",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!s) return null;
    const intake = (s.intake_data ?? {}) as Record<string, unknown>;
    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, author, text, created_at, metadata")
      .eq("session_id", data.id)
      .order("created_at", { ascending: true });
    const messages = await mapMessagesForPanel(msgs ?? []);
    const assignedToName = await resolveStaffName(s.assigned_to);
    return {
      id: s.id,
      phone: s.phone,
      contactName: s.contact_name ?? undefined,
      line: dbToUiLine(s.line),
      mode: dbToUiMode(s.mode),
      lastMessageAt: s.last_message_at,
      createdAt: s.created_at,
      assignedToName: assignedToName ?? undefined,
      lastMessage: messages.at(-1)?.text ?? "",
      leadStage: parseLeadStageFromIntake(intake),
      triagemProtocol:
        typeof intake["triagem_protocol"] === "string" ? intake["triagem_protocol"] : undefined,
      messages,
    };
  });

const replySchema = z
  .object({
    id: z.string().uuid(),
    text: z.string().max(4000).optional(),
    imageBase64: z.string().optional(),
    imageContentType: z.string().optional(),
    documentBase64: z.string().optional(),
    documentContentType: z.string().optional(),
    documentFilename: z.string().max(240).optional(),
  })
  .refine(
    (d) =>
      Boolean(d.text?.trim()) || Boolean(d.imageBase64) || Boolean(d.documentBase64),
    { message: "Informe texto, imagem ou documento." },
  );

export const replyAsAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => replySchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const { data: s } = await supabaseAdmin
      .from("sessions")
      .select("id, phone, line, organization_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!s) throw new Error("Sessão não encontrada");
    const orgId = (s.organization_id as string) || (await resolveOrganizationForUser(context.userId));
    const wa = { organizationId: orgId, line: s.line as DbLine };

    const caption = data.text?.trim() ?? "";
    const staffName = await resolveStaffName(context.userId);
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("sessions")
      .update({
        mode: "humano",
        assigned_to: context.userId,
        last_message_at: now,
        staff_seen_at: now,
      })
      .eq("id", s.id);

    let sent = false;
    let mediaPath: string | undefined;
    const meta: Record<string, unknown> = { sent_by: context.userId };

    if (data.imageBase64) {
      mediaPath = await storeChatMediaFromBase64(
        s.phone,
        data.imageBase64,
        data.imageContentType ?? "image/jpeg",
        "image",
      );
      meta.media_path = mediaPath;
      meta.media_mime = data.imageContentType ?? "image/jpeg";
      meta.media_kind = "image";
      const imageUrl = await signedChatMediaUrl(mediaPath, 60 * 60);
      if (!imageUrl) throw new Error("Não foi possível gerar URL da imagem.");
      const imgRes = await sendWhatsAppImage(
        wa,
        s.phone,
        imageUrl,
        caption ? agentWhatsAppCaption(staffName, caption) : undefined,
      );
      sent = imgRes.ok;
      if (!imgRes.ok) {
        await supabaseAdmin.from("messages").insert({
          session_id: s.id,
          direction: "out",
          author: "system",
          text: `(falha no envio da imagem: ${imgRes.reason ?? "desconhecida"})`,
          metadata: { error: imgRes.reason } as never,
        });
      }
    } else if (data.documentBase64) {
      const mime = data.documentContentType ?? "application/pdf";
      mediaPath = await storeChatMediaFromBase64(s.phone, data.documentBase64, mime, "document");
      meta.media_path = mediaPath;
      meta.media_mime = mime;
      meta.media_kind = "document";
      meta.filename = data.documentFilename ?? "documento.pdf";
      const docUrl = await signedChatMediaUrl(mediaPath, 60 * 60);
      if (!docUrl) throw new Error("Não foi possível gerar URL do documento.");
      const docRes = await sendWhatsAppDocument(
        wa,
        s.phone,
        docUrl,
        data.documentFilename ?? "documento.pdf",
        caption ? agentWhatsAppCaption(staffName, caption) : undefined,
      );
      sent = docRes.ok;
      if (!docRes.ok) {
        await supabaseAdmin.from("messages").insert({
          session_id: s.id,
          direction: "out",
          author: "system",
          text: `(falha no envio do documento: ${docRes.reason ?? "desconhecida"})`,
          metadata: { error: docRes.reason } as never,
        });
      }
    } else if (caption) {
      const parts = agentWhatsAppParts(staffName, caption);
      for (const part of parts) {
        await new Promise((r) => setTimeout(r, typingDelayMs(part)));
        const send = await sendWhatsAppText(wa, s.phone, part);
        if (send.ok) sent = true;
        else {
          await supabaseAdmin.from("messages").insert({
            session_id: s.id,
            direction: "out",
            author: "system",
            text: `(falha no envio Meta: ${send.reason ?? "desconhecida"})`,
            metadata: { error: send.reason } as never,
          });
          break;
        }
      }
    }

    const displayText =
      caption ||
      (data.imageBase64 ? "[imagem]" : data.documentBase64 ? "[documento]" : "");
    const { error: msgErr } = await supabaseAdmin.from("messages").insert({
      session_id: s.id,
      direction: "out",
      author: "agent",
      text: displayText,
      metadata: meta as never,
    });
    if (msgErr) throw new Error(msgErr.message);

    return { ok: true, sent };
  });

export const releaseBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "bot", assigned_to: null, staff_seen_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

export const assumeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    await supabaseAdmin
      .from("sessions")
      .update({ mode: "humano", assigned_to: context.userId, staff_seen_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

export const markConversationSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    await supabaseAdmin
      .from("sessions")
      .update({ staff_seen_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: true };
  });

// =========================================================
// TRIAGENS
// =========================================================
const triageFilterSchema = z
  .object({
    status: z.string().optional(),
    line: z.string().optional(),
    consultor: z.string().optional(),
    destino: z.string().optional(),
  })
  .optional();

async function hydrateTriages(rows: Array<Record<string, unknown>>) {
  const sessionIds = rows.map((t) => t.session_id as string).filter(Boolean);
  const assignedIds = rows
    .map((t) => t.assigned_to as string | null)
    .filter((x): x is string => Boolean(x));

  const [{ data: sess }, { data: profs }] = await Promise.all([
    sessionIds.length
      ? supabaseAdmin
          .from("sessions")
          .select("id, contact_name, phone, line")
          .in("id", sessionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; contact_name: string | null; phone: string; line: DbLine }> }),
    assignedIds.length
      ? supabaseAdmin
          .from("profiles")
          .select("id, name, email")
          .in("id", assignedIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; email: string }> }),
  ]);
  const sMap = new Map((sess ?? []).map((s) => [s.id, s]));
  const pMap = new Map((profs ?? []).map((p) => [p.id, p]));

  return rows.map((t) => {
    const s = sMap.get(t.session_id as string);
    const p = pMap.get(t.assigned_to as string);
    const pref = (t.preferencias as Record<string, unknown>) ?? {};
    return {
      id: t.id as string,
      protocol: t.protocol as string,
      name: s?.contact_name ?? s?.phone ?? "—",
      phone: s?.phone ?? "",
      line: s ? dbToUiLine(s.line) : ("descubra_ms" as UiLine),
      destino: (t.destino as string) ?? "—",
      dataIda: (t.data_ida as string) ?? "",
      dataVolta: (t.data_volta as string) ?? "",
      viajantes: ((t.adultos as number) ?? 0) + ((t.criancas as number) ?? 0),
      faixaOrcamento: t.orcamento_brl
        ? `R$ ${Number(t.orcamento_brl).toLocaleString("pt-BR")}`
        : "Sem definir",
      origem: (t.origem as string) ?? undefined,
      preferencias:
        typeof pref === "object" && pref !== null
          ? (pref.preferencias as string | undefined) ?? undefined
          : undefined,
      status: t.status === "aberta" ? "novo" : (t.status as string),
      assignedTo: (t.assigned_to as string) ?? undefined,
      assignedToName: p ? (p.name?.trim() || p.email) : undefined,
      notes: (t.notes as string) ?? undefined,
      sessionId: t.session_id as string,
      createdAt: t.created_at as string,
      updatedAt: t.updated_at as string,
    };
  });
}

export const fetchTriages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => triageFilterSchema.parse(i) ?? {})
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    let q = supabaseAdmin
      .from("travel_intake")
      .select(
        "id, protocol, destino, origem, status, assigned_to, created_at, updated_at, session_id, adultos, criancas, orcamento_brl, data_ida, data_volta, preferencias",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (data?.status && data.status !== "all") {
      const s = data.status === "novo" ? ["aberta", "novo"] : [data.status];
      q = q.in("status", s);
    }
    if (data?.consultor && data.consultor !== "all") q = q.eq("assigned_to", data.consultor);
    if (data?.destino) q = q.ilike("destino", `%${data.destino}%`);
    const { data: rows } = await q;
    let hydrated = await hydrateTriages((rows ?? []) as Array<Record<string, unknown>>);
    if (data?.line && data.line !== "all") hydrated = hydrated.filter((r) => r.line === data.line);
    return hydrated;
  });

export const fetchTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const { data: row } = await supabaseAdmin
      .from("travel_intake")
      .select(
        "id, protocol, destino, origem, status, assigned_to, created_at, updated_at, session_id, adultos, criancas, orcamento_brl, data_ida, data_volta, preferencias",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return null;
    const hyd = await hydrateTriages([row as Record<string, unknown>]);
    return hyd[0];
  });

const updateTriageSchema = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().max(4000).optional(),
});

export const updateTriage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updateTriageSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined)
      patch.status = data.status === "novo" ? "aberta" : data.status;
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
    // notes column doesn't exist in DB — armazenamos no preferencias.notes
    if (data.notes !== undefined) {
      const { data: cur } = await supabaseAdmin
        .from("travel_intake")
        .select("preferencias")
        .eq("id", data.id)
        .maybeSingle();
      const pref = ((cur?.preferencias as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      pref.notes = data.notes;
      patch.preferencias = pref as never;
    }
    const { error } = await supabaseAdmin
      .from("travel_intake")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// CANAL (channel_posts)
// =========================================================
export const fetchChannelPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const { data } = await supabaseAdmin
      .from("channel_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []).map((p) => {
      const meta = (p.metadata ?? {}) as Record<string, unknown>;
      return {
        id: p.id,
        eventId: p.external_id ?? p.id,
        thumbnail:
          p.image_url ??
          "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=600&h=400&fit=crop",
        title: p.title,
        eventDate: p.event_starts_at ?? p.created_at,
        city: (meta.city as string) ?? (meta.location as string) ?? "",
        link: p.link_url ?? "",
        body: p.body,
        status: p.status === "arquivado" ? "ignorado" : p.status,
        createdAt: p.created_at,
      };
    });
  });

const updatePostSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
});
export const updateChannelPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => updatePostSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const dbStatus = uiToDbStatusPost(data.status);
    const patch: Record<string, unknown> = { status: dbStatus };
    if (dbStatus === "publicado") {
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabaseAdmin
      .from("channel_posts")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// SETTINGS
// =========================================================
import { isDescubraConfigured } from "@/integrations/descubra/admin.server";
import { isMetaConfigured } from "@/lib/meta-send.server";

export const fetchSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const orgId = await resolveOrganizationForUser(context.userId);
    let { data: s } = await supabaseAdmin
      .from("channel_settings")
      .select("*")
      .maybeSingle();
    if (!s) {
      const ins = await supabaseAdmin
        .from("channel_settings")
        .insert({})
        .select("*")
        .single();
      s = ins.data ?? null;
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("is_guata, use_descubra_kb")
      .eq("id", orgId)
      .maybeSingle();

    return {
      organizationId: orgId,
      isGuataOrg: Boolean(org?.is_guata),
      useDescubraKb: Boolean(org?.use_descubra_kb),
      metaStatus: ((await isMetaConfigured(orgId, "descubra")) ? "conectado" : "desconectado") as
        | "conectado"
        | "desconectado",
      metaConfiguredDescubra: await isMetaConfigured(orgId, "descubra"),
      metaConfiguredViagens: await isMetaConfigured(orgId, "viagens"),
      descubraSupabaseConfigured: isDescubraConfigured(),
      descubraWebhookSecretConfigured: Boolean(process.env.DESCUBRA_WEBHOOK_SECRET),
      descubraCanalWebhookReady: Boolean(process.env.DESCUBRA_WEBHOOK_SECRET),
      personaDescubra: s?.persona_descubra ?? "",
      personaViagens: s?.persona_viagens ?? "",
      horarioAtendimento: s?.horario_atendimento ?? "",
      mensagemForaHorario: s?.mensagem_fora_horario ?? "",
      mensagemHumano: s?.mensagem_humano ?? "",
    };
  });

const settingsPatchSchema = z.object({
  personaDescubra: z.string().max(4000).optional(),
  personaViagens: z.string().max(4000).optional(),
  horarioAtendimento: z.string().max(200).optional(),
  mensagemForaHorario: z.string().max(2000).optional(),
  mensagemHumano: z.string().max(2000).optional(),
});
export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => settingsPatchSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.personaDescubra !== undefined) patch.persona_descubra = data.personaDescubra;
    if (data.personaViagens !== undefined) patch.persona_viagens = data.personaViagens;
    if (data.horarioAtendimento !== undefined) patch.horario_atendimento = data.horarioAtendimento;
    if (data.mensagemForaHorario !== undefined) patch.mensagem_fora_horario = data.mensagemForaHorario;
    if (data.mensagemHumano !== undefined) patch.mensagem_humano = data.mensagemHumano;

    const { data: existing } = await supabaseAdmin
      .from("channel_settings")
      .select("id")
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("channel_settings")
        .update(patch as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("channel_settings")
        .insert(patch as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// =========================================================
// AGENCY SERVICES
// =========================================================
export const fetchServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const { data } = await supabaseAdmin
      .from("agency_services")
      .select("*")
      .order("nome", { ascending: true });
    return (data ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      descricao: s.descricao ?? "",
      categoria: s.categoria ?? "",
      keywords: (s.keywords ?? []) as string[],
      ativo: s.ativo,
    }));
  });

const upsertServiceSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional().default(""),
  categoria: z.string().max(100).optional().default(""),
  keywords: z.array(z.string().min(1).max(60)).max(40).optional().default([]),
  ativo: z.boolean().default(true),
});
export const upsertService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => upsertServiceSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("agency_services")
        .update({
          nome: data.nome,
          descricao: data.descricao,
          categoria: data.categoria,
          keywords: data.keywords,
          ativo: data.ativo,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("agency_services")
      .insert({
        nome: data.nome,
        descricao: data.descricao,
        categoria: data.categoria,
        keywords: data.keywords,
        ativo: data.ativo,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const { error } = await supabaseAdmin
      .from("agency_services")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// STAFF (consultores para o select de "Atribuir consultor")
// =========================================================
export const fetchStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (!ids.length) return [] as Array<{ id: string; name: string; role: string }>;
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .in("id", ids);
    const roleByUser = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
    return (profs ?? []).map((p) => ({
      id: p.id,
      name: p.name?.trim() || p.email,
      role: roleByUser.get(p.id) ?? "consultor",
    }));
  });

export { resolveStaffName };
