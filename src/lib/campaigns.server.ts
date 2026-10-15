/**
 * Campanhas de disparo WhatsApp (janela 24h — mensagem de sessão).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  isMetaConfigured,
  sendWhatsAppImage,
  sendWhatsAppText,
  typingDelayMs,
} from "@/lib/meta-send.server";

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

function publicImageUrl(path: string): string | null {
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

export async function previewAudienceCount(
  line: CampaignLine,
  audience: CampaignAudience,
): Promise<number> {
  const targets = await resolveAudience(line, audience);
  return targets.length;
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
  },
): Promise<CampaignRow> {
  let imagePath: string | null = null;
  if (input.imageBase64) {
    const ext =
      input.imageContentType === "image/png"
        ? "png"
        : input.imageContentType === "image/webp"
          ? "webp"
          : "jpg";
    const bytes = Uint8Array.from(atob(input.imageBase64), (c) => c.charCodeAt(0));
    if (bytes.length > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB");
    imagePath = `${userId}/${Date.now()}-cartaz.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(imagePath, bytes, {
        contentType: input.imageContentType ?? "image/jpeg",
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);
  }

  const { data, error } = await supabaseAdmin
    .from("broadcast_campaigns")
    .insert({
      title: input.title.slice(0, 160),
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
  if (!isMetaConfigured(line)) {
    throw new Error("WhatsApp (Meta) não configurado para esta linha.");
  }
  const audience = campaign.audience as CampaignAudience;

  if (campaign.status === "rascunho") {
    const targets = await resolveAudience(line, audience);
    if (targets.length === 0) {
      throw new Error("Nenhum contato no público selecionado.");
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
    ? publicImageUrl(campaign.image_path as string)
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
      if (imageUrl) {
        const imgRes = await sendWhatsAppImage(line, phone, imageUrl, body || undefined);
        if (!imgRes.ok) {
          sentFail += 1;
          await supabaseAdmin
            .from("broadcast_recipients")
            .update({
              status: "falhou",
              error: imgRes.reason ?? "image_failed",
              sent_at: new Date().toISOString(),
            })
            .eq("id", rec.id);
          continue;
        }
        await persistOutbound(
          sessionId,
          body ? `[cartaz] ${body}` : "[cartaz]",
          { campaign_id: campaignId, kind: "campaign_image" },
        );
        if (body && body.length > 0) {
          await new Promise((r) => setTimeout(r, typingDelayMs(body)));
        }
      }

      if (body && !imageUrl) {
        const txtRes = await sendWhatsAppText(line, phone, body);
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
  return updated as CampaignRow;
}
