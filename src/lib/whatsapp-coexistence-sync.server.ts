/**
 * Sincronização de histórico do app (coexistência) — POST smb_app_data + estado no canal.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GRAPH } from "@/lib/whatsapp-embedded.shared";

const OFFICIAL_LINE = "descubra" as const;
const HISTORY_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CoexistenceHistoryStatus =
  | "none"
  | "requested"
  | "syncing"
  | "complete"
  | "declined"
  | "error";

export interface CoexistenceMeta {
  connected_at?: string;
  history_sync_requested_at?: string;
  history_sync_request_id?: string;
  history_progress?: number;
  history_status?: CoexistenceHistoryStatus;
  history_error?: string;
}

export interface CoexistenceHistoryStatusView {
  connected: boolean;
  connectedAt: string | null;
  status: CoexistenceHistoryStatus;
  progress: number;
  error: string | null;
  requestedAt: string | null;
  canRequestSync: boolean;
  withinSyncWindow: boolean;
  importedMessages: number;
  hint: string;
}

function asMeta(raw: unknown): CoexistenceMeta {
  if (!raw || typeof raw !== "object") return {};
  return raw as CoexistenceMeta;
}

async function loadOfficialChannel(organizationId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("phone_number_id, access_token, coexistence_meta, is_active")
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function patchCoexistenceMeta(
  organizationId: string,
  patch: Partial<CoexistenceMeta>,
): Promise<void> {
  const row = await loadOfficialChannel(organizationId);
  if (!row) return;
  const next: CoexistenceMeta = { ...asMeta(row.coexistence_meta), ...patch };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (next as Record<string, unknown>)[k];
  }
  const { error } = await supabaseAdmin
    .from("whatsapp_channels")
    .update({ coexistence_meta: next as never, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE);
  if (error) console.error("[coexistence-meta] update:", error.message);
}

export async function resetCoexistenceMeta(organizationId: string): Promise<void> {
  await supabaseAdmin
    .from("whatsapp_channels")
    .update({ coexistence_meta: {} as never, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE);
}

async function countImportedHistoryMessages(organizationId: string): Promise<number> {
  const { data: sessions } = await supabaseAdmin
    .from("sessions")
    .select("id")
    .eq("organization_id", organizationId);
  const ids = (sessions ?? []).map((s) => s.id as string);
  if (!ids.length) return 0;
  const { count } = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .in("session_id", ids)
    .filter("metadata->>coexistence_history", "eq", "true");
  return count ?? 0;
}

async function postSmbAppData(
  phoneNumberId: string,
  accessToken: string,
  syncType: "history" | "smb_app_state_sync",
): Promise<string | undefined> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      sync_type: syncType,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    request_id?: string;
  };
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Meta respondeu ${res.status} ao pedir sync ${syncType}.`);
  }
  return json.request_id;
}

/** Pede à Meta o envio dos webhooks history (uma vez por ciclo de onboarding). */
export async function requestCoexistenceHistorySyncForOrg(
  organizationId: string,
): Promise<{ requestId?: string; alreadyRequested: boolean }> {
  const row = await loadOfficialChannel(organizationId);
  const phoneNumberId = row?.phone_number_id?.trim();
  const token = row?.access_token?.trim();
  if (!row?.is_active || !phoneNumberId || !token) {
    throw new Error("Conecte o WhatsApp oficial antes de importar o histórico.");
  }
  const meta = asMeta(row.coexistence_meta);
  if (meta.history_sync_requested_at) {
    return { alreadyRequested: true, requestId: meta.history_sync_request_id };
  }
  const requestId = await postSmbAppData(phoneNumberId, token, "history");
  const now = new Date().toISOString();
  await patchCoexistenceMeta(organizationId, {
    history_sync_requested_at: now,
    history_sync_request_id: requestId,
    history_status: "requested",
    history_error: undefined,
    history_progress: meta.history_progress ?? 0,
  });
  return { requestId, alreadyRequested: false };
}

export async function applyHistoryWebhookToCoexistenceMeta(
  organizationId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const blocks = Array.isArray(value.history) ? value.history : [];
  let maxProgress = 0;
  let declined: string | undefined;
  for (const block of blocks as Record<string, unknown>[]) {
    const blockMeta = block.metadata as { progress?: number } | undefined;
    if (typeof blockMeta?.progress === "number") {
      maxProgress = Math.max(maxProgress, blockMeta.progress);
    }
    const blockErrors = block.errors as { message?: string; code?: number }[] | undefined;
    if (blockErrors?.length) {
      const err = blockErrors[0];
      if (err?.code === 2593109) {
        declined =
          err.message ??
          "Histórico desligado no WhatsApp Business — ative o compartilhamento no app.";
      } else {
        declined = err.message ?? "A Meta não enviou o histórico.";
      }
    }
    if (Array.isArray(block.threads) && (block.threads as unknown[]).length > 0) {
      maxProgress = Math.max(maxProgress, 1);
    }
  }

  const imported = await countImportedHistoryMessages(organizationId);
  let status: CoexistenceHistoryStatus = "syncing";
  let error: string | undefined;

  if (declined) {
    status = "declined";
    error = declined;
  } else if (maxProgress >= 100) {
    status = "complete";
  } else if (maxProgress > 0 || imported > 0) {
    status = "syncing";
  }

  await patchCoexistenceMeta(organizationId, {
    history_progress: maxProgress,
    history_status: status,
    ...(error ? { history_error: error.slice(0, 500) } : { history_error: undefined }),
  });
}

export async function getCoexistenceHistoryStatusForOrg(
  organizationId: string,
): Promise<CoexistenceHistoryStatusView> {
  const { data: row } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("phone_number_id, access_token, coexistence_meta, is_active, updated_at")
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE)
    .maybeSingle();
  const connected = Boolean(row?.is_active && row?.phone_number_id && row?.access_token);
  const meta = asMeta(row?.coexistence_meta);
  const connectedAt =
    meta.connected_at ?? (typeof row?.updated_at === "string" ? row.updated_at : null);
  const withinSyncWindow =
    connectedAt != null &&
    Date.now() - new Date(connectedAt).getTime() < HISTORY_SYNC_WINDOW_MS;
  const imported = connected ? await countImportedHistoryMessages(organizationId) : 0;
  const progress = Math.max(meta.history_progress ?? 0, imported > 0 ? 1 : 0);
  const status = meta.history_status ?? "none";
  const alreadyRequested = Boolean(meta.history_sync_requested_at);

  let canRequestSync = connected && !alreadyRequested;
  if (connectedAt && !withinSyncWindow && !alreadyRequested) {
    canRequestSync = false;
  }

  let hint = "";
  if (!connected) {
    hint = "Conecte a coexistência para importar conversas antigas do celular.";
  } else if (status === "complete" || progress >= 100) {
    hint = `Histórico importado (${imported} mensagem(ns) no painel).`;
  } else if (status === "declined") {
    hint =
      "O histórico não foi compartilhado. No WhatsApp Business, ative o compartilhamento; para tentar outra vez, reconecte na Meta.";
  } else if (alreadyRequested && (status === "requested" || status === "syncing")) {
    hint =
      imported > 0
        ? `Importando… progresso ${progress}% — ${imported} mensagem(ns) no painel. Mantenha o app aberto.`
        : `Aguardando a Meta (${progress}%). Aceite compartilhar o histórico no celular.`;
  } else if (!withinSyncWindow && connectedAt && !alreadyRequested) {
    hint =
      "Mais de 24 h desde a conexão sem pedir histórico. Reconecte via Meta para nova tentativa.";
  } else if (imported === 0 && canRequestSync) {
    hint =
      "As conversas antigas do celular ainda não estão aqui. Importe e confirme no WhatsApp Business.";
  } else if (imported === 0 && alreadyRequested) {
    hint = "Pedido enviado; aguarde os lotes ou veja Diagnóstico WhatsApp.";
  } else {
    hint = `${imported} mensagem(ns) antigas no painel.`;
  }

  return {
    connected,
    connectedAt,
    status,
    progress,
    error: meta.history_error ?? null,
    requestedAt: meta.history_sync_requested_at ?? null,
    canRequestSync,
    withinSyncWindow,
    importedMessages: imported,
    hint,
  };
}