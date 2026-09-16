/**
 * Diagnóstico da ligação com o WhatsApp (Meta Cloud API) — server-only.
 * Nunca devolve credenciais: só status, datas e mensagens de erro da Meta.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendWhatsAppText } from "@/lib/meta-send.server";

export interface DeliveryRow {
  id: string;
  created_at: string;
  signature_ok: boolean;
  event_kind: string;
  phone_number_id: string | null;
  processed: boolean;
  error: string | null;
  preview: string;
}

export interface WhatsAppDiagnostics {
  ranAt: string;
  secrets: {
    accessToken: boolean;
    phoneNumberId: boolean;
    appSecret: boolean;
    verifyToken: boolean;
    viagensConfigurada: boolean;
  };
  entregas: {
    total: number;
    totalAssinaturaOk: number;
    ultima: string | null;
    ultimaAssinaturaOk: string | null;
  };
  numero: {
    ok: boolean;
    displayPhone?: string;
    verifiedName?: string;
    quality?: string;
    error?: string;
  };
  token: {
    ok: boolean;
    expiraEm?: string | null;
    permanente?: boolean;
    appId?: string;
    scopes?: string[];
    error?: string;
  };
  conversas: { sessions: number; mensagens: number; triagens: number };
  ultimasEntregas: DeliveryRow[];
}

const GRAPH = "https://graph.facebook.com/v21.0";

function token(): string | undefined {
  return (
    process.env.META_ACCESS_TOKEN_DESCUBRA ?? process.env.META_ACCESS_TOKEN
  );
}
function phoneId(): string | undefined {
  return (
    process.env.META_PHONE_NUMBER_ID_DESCUBRA ??
    process.env.META_PHONE_NUMBER_ID
  );
}

async function checkNumero(): Promise<WhatsAppDiagnostics["numero"]> {
  const t = token();
  const id = phoneId();
  if (!t || !id) return { ok: false, error: "Credenciais ausentes." };
  try {
    const res = await fetch(
      `${GRAPH}/${id}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${t}` } },
    );
    const json = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          json?.error?.message ??
          `A Meta respondeu ${res.status} ao consultar o número.`,
      };
    }
    return {
      ok: true,
      displayPhone: json.display_phone_number,
      verifiedName: json.verified_name,
      quality: json.quality_rating,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}

async function checkToken(): Promise<WhatsAppDiagnostics["token"]> {
  const t = token();
  if (!t) return { ok: false, error: "Token de acesso não configurado." };
  try {
    const res = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(t)}`,
      { headers: { Authorization: `Bearer ${t}` } },
    );
    const json = (await res.json()) as Record<string, any>;
    if (!res.ok) {
      return {
        ok: false,
        error:
          json?.error?.message ??
          `A Meta respondeu ${res.status} ao validar o token.`,
      };
    }
    const d = json.data ?? {};
    const expires = Number(d.expires_at ?? 0);
    return {
      ok: Boolean(d.is_valid),
      permanente: expires === 0,
      expiraEm: expires ? new Date(expires * 1000).toISOString() : null,
      appId: d.app_id ? String(d.app_id) : undefined,
      scopes: Array.isArray(d.scopes) ? d.scopes : undefined,
      error: d.is_valid ? undefined : (d.error?.message ?? "Token inválido."),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "erro de rede" };
  }
}

function previewOf(payload: any): string {
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value ?? {};
    const msg = value.messages?.[0];
    if (msg) return `Mensagem de ${msg.from}: ${msg.text?.body ?? msg.type}`;
    const st = value.statuses?.[0];
    if (st) return `Status "${st.status}" para ${st.recipient_id}`;
    return JSON.stringify(payload).slice(0, 140);
  } catch {
    return "";
  }
}

export async function runWhatsAppDiagnostics(): Promise<WhatsAppDiagnostics> {
  const [numero, tok] = await Promise.all([checkNumero(), checkToken()]);

  const total = await supabaseAdmin
    .from("whatsapp_deliveries")
    .select("*", { count: "exact", head: true });
  const okCount = await supabaseAdmin
    .from("whatsapp_deliveries")
    .select("*", { count: "exact", head: true })
    .eq("signature_ok", true);
  const { data: last } = await supabaseAdmin
    .from("whatsapp_deliveries")
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: lastOk } = await supabaseAdmin
    .from("whatsapp_deliveries")
    .select("created_at")
    .eq("signature_ok", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: rows } = await supabaseAdmin
    .from("whatsapp_deliveries")
    .select(
      "id, created_at, signature_ok, event_kind, phone_number_id, processed, error, payload",
    )
    .order("created_at", { ascending: false })
    .limit(15);

  const sessions = await supabaseAdmin
    .from("sessions")
    .select("*", { count: "exact", head: true });
  const mensagens = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true });
  const triagens = await supabaseAdmin
    .from("travel_intake")
    .select("*", { count: "exact", head: true });

  return {
    ranAt: new Date().toISOString(),
    secrets: {
      accessToken: Boolean(token()),
      phoneNumberId: Boolean(phoneId()),
      appSecret: Boolean(process.env.META_APP_SECRET),
      verifyToken: Boolean(process.env.META_VERIFY_TOKEN),
      viagensConfigurada: Boolean(
        process.env.META_ACCESS_TOKEN_VIAGENS &&
          process.env.META_PHONE_NUMBER_ID_VIAGENS,
      ),
    },
    entregas: {
      total: total.count ?? 0,
      totalAssinaturaOk: okCount.count ?? 0,
      ultima: (last?.created_at as string) ?? null,
      ultimaAssinaturaOk: (lastOk?.created_at as string) ?? null,
    },
    numero,
    token: tok,
    conversas: {
      sessions: sessions.count ?? 0,
      mensagens: mensagens.count ?? 0,
      triagens: triagens.count ?? 0,
    },
    ultimasEntregas: (rows ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,
      signature_ok: r.signature_ok,
      event_kind: r.event_kind,
      phone_number_id: r.phone_number_id,
      processed: r.processed,
      error: r.error,
      preview: previewOf(r.payload),
    })),
  };
}

export async function sendTestWhatsApp(
  to: string,
  text: string,
): Promise<{ ok: boolean; message: string }> {
  const digits = to.replace(/\D/g, "");
  if (digits.length < 10) {
    return {
      ok: false,
      message: "Informe o número completo com DDI e DDD (ex.: 5567999999999).",
    };
  }
  const res = await sendWhatsAppText("descubra", digits, text);
  if (res.ok) {
    return {
      ok: true,
      message: `Mensagem aceita pela Meta (id ${res.messageId ?? "—"}).`,
    };
  }
  if (res.reason === "not_configured") {
    return { ok: false, message: "Token ou número da Meta não configurados." };
  }
  return { ok: false, message: `A Meta recusou: ${res.reason}` };
}
