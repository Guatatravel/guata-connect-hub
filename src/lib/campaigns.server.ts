/**
 * Campanhas de disparo WhatsApp (janela 24h — mensagem de sessão).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isGuataMetaConfigured,
  sendWhatsAppImage,
  sendWhatsAppText,
  typingDelayMs,
} from "@/lib/meta-send.server";
import { getGuataOrganizationId } from "@/lib/organizations.server";

const BUCKET = "campaigns";
const MAX_SEND_PER_LAUNCH = 80;
const SEND_GAP_MS = 900;

import type {
  CampaignAudience,
  CampaignLine,
  CampaignRow,
} from "@/lib/campaigns.types";

export type { CampaignAudience, CampaignLine, CampaignRow } from "@/lib/campaigns.types";

const AUDIENCE_MS: Record<CampaignAudience, number | null> = {
  active_24h: 24 * 60 * 60 * 1000,
  active_7d: 7 * 24 * 60 * 60 * 1000,
  active_30d: 30 * 24 * 60 * 60 * 1000,
  all_sessions: null,
};

/** URL que a Meta consegue baixar (assinada; não depende de bucket público). */
async function campaignImageUrl(path: string): Promise<string | null> {
  const { data: signed, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!error && signed?.signedUrl) return signed.signedUrl;

  const base = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function lastUserMessageAt(sessionId: string): Promise<Date | null> {
  const { data } = await supabaseAdmin
    .from("messages")
    .select("created_at")
    .eq("session_id", sessionId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ? new Date(data.created_at) : null;
}

function withinAudience(lastIn: Date | null, audience: CampaignAudience): boolean {
  const windowMs = AUDIENCE_MS[audience];
  if (windowMs === null) return true;
  if (!lastIn) return false;
  return Date.now() - lastIn.getTime() <= windowMs;
}

/** Meta só permite texto/imagem livre se o cliente falou nas últimas 24h. */
function withinMetaSessionWindow(lastIn: Date | null): boolean {
  if (!lastIn) return false;
  return Date.now() - lastIn.getTime() <= 24 * 60 * 60 * 1000;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as CampaignRow[];
}

export async function getCampaign(id: string): Promise<CampaignRow> {
  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campanha não encontrada");
  return data as CampaignRow;
}

async function uploadCampaignImage(
  userId: string,
  imageBase64: string,
  imageContentType?: string,
): Promise<string> {
  const ext =
    imageContentType === "image/png"
      ? "png"
      : imageContentType === "image/webp"
        ? "webp"
        : "jpg";
  const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB");
  const imagePath = `${userId}/${Date.now()}-cartaz.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(imagePath, bytes, {
      contentType: imageContentType ?? "image/jpeg",
      upsert: true,
    });
  if (upErr) throw new Error(upErr.message);
  return imagePath;
}

export async function updateCampaignDraft(
  id: string,
  userId: string,
  input: {
    title: string;
    line: CampaignLine;
    body: string;
    audience: CampaignAudience;
    imageBase64?: string;
    imageContentType?: string;
    removeImage?: boolean;
  },
): Promise<CampaignRow> {
  const existing = await getCampaign(id);
  if (existing.status !== "rascunho") {
    throw new Error("Só é possível editar campanhas em rascunho.");
  }

  let imagePath: string | null = existing.image_path;
  if (input.removeImage) imagePath = null;
  if (input.imageBase64) {
    imagePath = await uploadCampaignImage(
      userId,
      input.imageBase64,
      input.imageContentType,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .update({
      title: input.title.slice(0, 160),
      line: input.line,
      body: input.body.slice(0, 4000),
      audience: input.audience,
      image_path: imagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignRow;
}

export async function deleteCampaign(id: string): Promise<void> {
  const row = await getCampaign(id);
  if (row.status === "enviando") {
    throw new Error("Campanha em envio — use “Continuar envio” ou aguarde terminar antes de excluir.");
  }
  const { error } = await supabaseAdmin.from("broadcast_campaigns").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Nova campanha com mesmo conteúdo e disparo imediato (público atual). */
export async function duplicateAndLaunchCampaign(
  userId: string,
  sourceId: string,
): Promise<CampaignRow> {
  const src = await getCampaign(sourceId);
  const line = src.line as CampaignLine;
  await assertMetaConfiguredForLine(line);
  const baseTitle = src.title.replace(/\s*·\s*(Descubra|Viagens)\s*$/i, "").trim();
  const title = `${baseTitle} (reenvio)`.slice(0, 160);
  const draft = await createCampaignDraft(userId, {
    title,
    line,
    body: String(src.body ?? ""),
    audience: src.audience as CampaignAudience,
    imagePathReuse: src.image_path,
  });
  return launchCampaign(draft.id);
}

export async function saveCampaignDraft(
  userId: string,
  input: CreateCampaignInput & { id?: string },
): Promise<CampaignRow> {
  if (input.line === "both") {
    throw new Error("Rascunho só para uma linha — escolha Descubra ou Viagens.");
  }
  if (input.id) {
    const existing = await getCampaign(input.id);
    if (!input.body.trim() && !input.imageBase64 && !existing.image_path) {
      throw new Error("Informe o texto ou anexe um cartaz.");
    }
    return updateCampaignDraft(input.id, userId, {
      title: input.title.trim() || "Campanha",
      line: input.line,
      body: input.body,
      audience: input.audience,
      imageBase64: input.imageBase64,
      imageContentType: input.imageContentType,
      removeImage: false,
    });
  }
  if (!input.body.trim() && !input.imageBase64) {
    throw new Error("Informe o texto ou anexe um cartaz.");
  }
  return createCampaignDraft(userId, {
    title: input.title.trim() || "Campanha",
    line: input.line,
    body: input.body,
    audience: input.audience,
    imageBase64: input.imageBase64,
    imageContentType: input.imageContentType,
  });
}

function linesForSelect(line: CampaignLine | "both"): CampaignLine[] {
  return line === "both" ? ["descubra", "viagens"] : [line];
}

export async function getCampaignMetaStatus(): Promise<{
  descubra: boolean;
  viagens: boolean;
}> {
  return {
    descubra: await isGuataMetaConfigured("descubra"),
    viagens: await isGuataMetaConfigured("viagens"),
  };
}

export async function assertMetaConfiguredForLine(line: CampaignLine | "both"): Promise<void> {
  const status = await getCampaignMetaStatus();
  if (line === "both") {
    if (!status.descubra && !status.viagens) {
      throw new Error(
        "WhatsApp (Meta) não configurado. No Lovable/servidor, defina META_ACCESS_TOKEN e META_PHONE_NUMBER_ID (e opcionalmente sufixos _DESCUBRA e _VIAGENS para cada linha).",
      );
    }
    if (!status.descubra) {
      throw new Error(
        "Descubra MS: Meta não configurada. Defina META_ACCESS_TOKEN_DESCUBRA e META_PHONE_NUMBER_ID_DESCUBRA (ou as variáveis sem sufixo).",
      );
    }
    if (!status.viagens) {
      throw new Error(
        "Guatá: Meta não configurada. Defina META_ACCESS_TOKEN_VIAGENS e META_PHONE_NUMBER_ID_VIAGENS.",
      );
    }
    return;
  }
  if (!(await isGuataMetaConfigured(line))) {
    const label = line === "descubra" ? "Descubra MS" : "Guatá";
    const suffix = line === "descubra" ? "_DESCUBRA" : "_VIAGENS";
    throw new Error(
      `${label}: WhatsApp (Meta) não configurado. Defina META_ACCESS_TOKEN${suffix} e META_PHONE_NUMBER_ID${suffix} no ambiente de produção (Lovable → Secrets).`,
    );
  }
}

export async function previewAudienceCount(
  line: CampaignLine | "both",
  audience: CampaignAudience,
): Promise<{ filterCount: number; eligible24h: number }> {
  let filterCount = 0;
  let eligible24h = 0;
  for (const l of linesForSelect(line)) {
    const targets = await resolveAudience(l, audience);
    filterCount += targets.length;
    for (const t of targets) {
      const lastIn = await lastUserMessageAt(t.session_id);
      if (withinMetaSessionWindow(lastIn)) eligible24h += 1;
    }
  }
  return { filterCount, eligible24h };
}

async function resolveAudience(
  line: CampaignLine,
  audience: CampaignAudience,
): Promise<Array<{ phone: string; session_id: string }>> {
  const { data: sessions, error } = await supabaseAdmin
    .from("sessions")
    .select("id, phone")
    .eq("line", line)
    .is("archived_at", null)
    .limit(2000);
  if (error) throw new Error(error.message);

  const out: Array<{ phone: string; session_id: string }> = [];
  const seen = new Set<string>();

  for (const s of sessions ?? []) {
    const phone = String(s.phone).replace(/\D/g, "");
    if (!phone || seen.has(phone)) continue;
    const lastIn = await lastUserMessageAt(s.id);
    if (!withinAudience(lastIn, audience)) continue;
    seen.add(phone);
    out.push({ phone, session_id: s.id });
  }
  return out;
}

export async function createCampaignDraft(
  userId: string,
  input: {
    title: string;
    line: CampaignLine;
    body: string;
    audience: CampaignAudience;
    imageBase64?: string;
    imageContentType?: string;
    imagePathReuse?: string | null;
    titleSuffix?: string;
  },
): Promise<CampaignRow> {
  let imagePath: string | null = input.imagePathReuse ?? null;
  if (input.imageBase64 && !imagePath) {
    imagePath = await uploadCampaignImage(
      userId,
      input.imageBase64,
      input.imageContentType,
    );
  }

  const title = (input.title + (input.titleSuffix ?? "")).slice(0, 160);
  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .insert({
      title,
      line: input.line,
      body: input.body.slice(0, 4000),
      audience: input.audience,
      image_path: imagePath,
      status: "rascunho",
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as CampaignRow;
}

async function persistOutbound(
  sessionId: string,
  text: string,
  meta: Record<string, unknown>,
) {
  await supabaseAdmin.from("messages").insert({
    session_id: sessionId,
    direction: "out",
    author: "bot",
    text,
    metadata: meta as never,
  });
  await supabaseAdmin
    .from("sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);
}

export async function launchCampaign(campaignId: string): Promise<CampaignRow> {
  const { data: campaign, error: cErr } = await supabaseAdmin
    .from("broadcast_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!campaign) throw new Error("Campanha não encontrada");
  if (campaign.status === "concluida") throw new Error("Campanha já foi enviada.");

  const line = campaign.line as CampaignLine;
  await assertMetaConfiguredForLine(line);
  const guataOrgId = await getGuataOrganizationId();
  const wa = { organizationId: guataOrgId, line };
  const audience = campaign.audience as CampaignAudience;

  if (campaign.status === "rascunho") {
    const targets = await resolveAudience(line, audience);
    if (targets.length === 0) {
      throw new Error(
        "Nenhum contato no público selecionado. Escolha “Todas as conversas da linha” ou garanta que clientes já falaram com esse número (sessões no painel Conversas).",
      );
    }
    await supabaseAdmin
      .from("broadcast_campaigns")
      .update({ status: "enviando", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    await supabaseAdmin.from("broadcast_recipients").delete().eq("campaign_id", campaignId);
    await supabaseAdmin.from("broadcast_recipients").insert(
      targets.map((t) => ({
        campaign_id: campaignId,
        phone: t.phone,
        session_id: t.session_id,
        status: "pendente",
      })),
    );
  } else if (campaign.status !== "enviando") {
    throw new Error("Campanha não pode ser enviada neste status.");
  }

  const imageUrl = campaign.image_path
    ? await campaignImageUrl(campaign.image_path as string)
    : null;
  const body = String(campaign.body ?? "").trim();

  let sentOk = 0;
  let sentFail = 0;
  let sentSkip = 0;

  const { data: recipients } = await supabaseAdmin
    .from("broadcast_recipients")
    .select("id, phone, session_id")
    .eq("campaign_id", campaignId)
    .eq("status", "pendente")
    .limit(MAX_SEND_PER_LAUNCH);

  for (const rec of recipients ?? []) {
    const sessionId = rec.session_id as string;
    const phone = rec.phone as string;
    const lastIn = await lastUserMessageAt(sessionId);

    if (!withinMetaSessionWindow(lastIn)) {
      sentSkip += 1;
      await supabaseAdmin
        .from("broadcast_recipients")
        .update({
          status: "ignorado",
          error: "fora_janela_24h",
          sent_at: new Date().toISOString(),
        })
        .eq("id", rec.id);
      continue;
    }

    try {
      let delivered = false;
      if (imageUrl) {
        const imgRes = await sendWhatsAppImage(wa, phone, imageUrl, body || undefined);
        if (imgRes.ok) {
          delivered = true;
          await persistOutbound(
            sessionId,
            body ? `[cartaz] ${body}` : "[cartaz]",
            { campaign_id: campaignId, kind: "campaign_image" },
          );
          if (body && body.length > 0) {
            await new Promise((r) => setTimeout(r, typingDelayMs(body)));
          }
        } else if (body) {
          const txtRes = await sendWhatsAppText(wa, phone, body);
          if (txtRes.ok) {
            delivered = true;
            await persistOutbound(sessionId, body, {
              campaign_id: campaignId,
              kind: "campaign_text_fallback",
              image_error: imgRes.reason,
            });
          }
        }
        if (!delivered) {
          sentFail += 1;
          await supabaseAdmin
            .from("broadcast_recipients")
            .update({
              status: "falhou",
              error: "image_failed",
              sent_at: new Date().toISOString(),
            })
            .eq("id", rec.id);
          continue;
        }
      }

      if (body && !imageUrl) {
        const txtRes = await sendWhatsAppText(wa, phone, body);
        if (!txtRes.ok) {
          sentFail += 1;
          await supabaseAdmin
            .from("broadcast_recipients")
            .update({
              status: "falhou",
              error: txtRes.reason ?? "text_failed",
              sent_at: new Date().toISOString(),
            })
            .eq("id", rec.id);
          continue;
        }
        await persistOutbound(sessionId, body, {
          campaign_id: campaignId,
          kind: "campaign_text",
        });
        delivered = true;
      }
      if (!body && !imageUrl) {
        sentSkip += 1;
        await supabaseAdmin
          .from("broadcast_recipients")
          .update({
            status: "ignorado",
            error: "sem_conteudo",
            sent_at: new Date().toISOString(),
          })
          .eq("id", rec.id);
        continue;
      }

      sentOk += 1;
      await supabaseAdmin
        .from("broadcast_recipients")
        .update({
          status: "enviado",
          error: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", rec.id);
    } catch (e) {
      sentFail += 1;
      await supabaseAdmin
        .from("broadcast_recipients")
        .update({
          status: "falhou",
          error: e instanceof Error ? e.message : String(e),
          sent_at: new Date().toISOString(),
        })
        .eq("id", rec.id);
    }

    await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  const { count: pending } = await supabaseAdmin
    .from("broadcast_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "pendente");

  const finalStatus = (pending ?? 0) > 0 ? "enviando" : "concluida";
  const patch = {
    status: finalStatus,
    sent_ok: (campaign.sent_ok as number) + sentOk,
    sent_fail: (campaign.sent_fail as number) + sentFail,
    sent_skip: (campaign.sent_skip as number) + sentSkip,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: uErr } = await supabaseAdmin
    .from("broadcast_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .select("*")
    .single();
  if (uErr) throw new Error(uErr.message);
  const row = updated as CampaignRow;
  if (
    row.status === "concluida" &&
    row.sent_ok === 0 &&
    (row.sent_skip ?? 0) > 0 &&
    (row.sent_fail ?? 0) === 0
  ) {
    throw new Error(
      `Nenhuma mensagem entregue: ${row.sent_skip} contato(s) fora da janela de 24h da Meta. Peça para o cliente mandar um oi no WhatsApp hoje e tente de novo.`,
    );
  }
  return row;
}

export interface CreateCampaignInput {
  title: string;
  line: CampaignLine | "both";
  body: string;
  audience: CampaignAudience;
  imageBase64?: string;
  imageContentType?: string;
}

/** Cria e envia (1 ou 2 campanhas quando line === both). */
export async function createAndLaunchCampaigns(
  userId: string,
  input: CreateCampaignInput,
): Promise<{ results: CampaignRow[] }> {
  await assertMetaConfiguredForLine(input.line);
  const lines = linesForSelect(input.line);
  const results: CampaignRow[] = [];
  let sharedImagePath: string | null = null;
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const suffix =
      input.line === "both"
        ? ln === "descubra"
          ? " · Descubra"
          : " · Viagens"
        : "";
    try {
      const draft = await createCampaignDraft(userId, {
        title: input.title,
        titleSuffix: suffix,
        line: ln,
        body: input.body,
        audience: input.audience,
        imageBase64: i === 0 ? input.imageBase64 : undefined,
        imageContentType: i === 0 ? input.imageContentType : undefined,
        imagePathReuse: i > 0 ? sharedImagePath : undefined,
      });
      if (draft.image_path) sharedImagePath = draft.image_path;
      results.push(await launchCampaign(draft.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${ln}: ${msg}`);
    }
  }

  if (results.length === 0) {
    throw new Error(errors.join(" | ") || "Não foi possível enviar a campanha.");
  }
  if (errors.length > 0) {
    console.warn("[campaigns] disparo parcial:", errors.join(" | "));
  }
  return { results };
}
