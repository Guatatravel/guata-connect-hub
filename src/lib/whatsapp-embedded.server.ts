/**
 * Troca o código do cadastro incorporado por um token de negócio e grava
 * a linha oficial da organização. O token não volta para o navegador.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  EMBEDDED_SIGNUP_CONFIG_ID,
  GRAPH,
  digitId,
  metaConnectionError,
  pickPhoneNumber,
  pickWabaId,
  publicWhatsAppConnection,
  readOAuthAccessToken,
  type GranularScope,
  type GraphPhoneNumber,
  type WhatsAppConnectionView,
} from "@/lib/whatsapp-embedded.shared";
import { serverWhatsAppWebhookUrl } from "@/lib/public-app-url.server";
import { META_WHATSAPP_WEBHOOK_FIELDS } from "@/lib/whatsapp-webhook.shared";

const OFFICIAL_LINE = "descubra" as const;

export interface EmbeddedSignupInput {
  code: string;
  wabaId?: string;
  phoneNumberId?: string;
}

export interface WhatsAppEmbeddedState {
  appId: string;
  configId: string;
  ready: boolean;
  canManage: boolean;
  connection: WhatsAppConnectionView;
}

interface GraphErrorBody {
  error?: { message?: string };
}

export function readEmbeddedConfig(): { appId: string; configId: string; ready: boolean } {
  const appId = process.env["META_APP_ID"]?.trim() ?? "";
  const appSecret = process.env["META_APP_SECRET"]?.trim() ?? "";
  return {
    appId,
    configId: EMBEDDED_SIGNUP_CONFIG_ID,
    ready: Boolean(appId && appSecret),
  };
}

export async function readEmbeddedSignupState(organizationId: string): Promise<WhatsAppEmbeddedState> {
  const config = readEmbeddedConfig();
  return { ...config, canManage: true, connection: await readOfficialConnection(organizationId) };
}

export async function completeEmbeddedSignup(
  organizationId: string,
  input: EmbeddedSignupInput,
): Promise<WhatsAppConnectionView> {
  const config = readEmbeddedConfig();
  const appSecret = process.env["META_APP_SECRET"]?.trim() ?? "";
  if (!config.ready || !appSecret) {
    throw new Error("A conexão oficial aguarda a configuração do aplicativo Meta.");
  }
  const accessToken = await exchangeCode(input.code, config.appId, appSecret);
  const scopes = input.wabaId ? undefined : await debugGranularScopes(accessToken, config.appId);
  const wabaId = pickWabaId(input.wabaId, scopes);
  const phones = await listPhoneNumbers(wabaId, accessToken);
  const phone = pickPhoneNumber(input.phoneNumberId, phones);
  await subscribeApp(wabaId, accessToken);
  await assertPhoneAvailable(organizationId, phone.id);
  await saveOfficialChannel(organizationId, {
    wabaId,
    phoneNumberId: phone.id,
    accessToken,
  });
  return publicWhatsAppConnection({
    phoneNumberId: phone.id,
    wabaId,
    displayPhone: phone.display_phone_number,
    verifiedName: phone.verified_name,
  });
}

async function readOfficialConnection(organizationId: string): Promise<WhatsAppConnectionView> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("waba_id, phone_number_id, access_token, is_active")
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o WhatsApp desta organização.");
  const phoneNumberId = digitId(data?.phone_number_id) ?? null;
  const wabaId = digitId(data?.waba_id) ?? null;
  const token = data?.access_token?.trim();
  if (!token || !phoneNumberId || !data?.is_active) {
    return { connected: false, displayPhone: null, verifiedName: null, phoneNumberId, wabaId };
  }
  try {
    const phone = await fetchPhone(phoneNumberId, token);
    return {
      connected: true,
      phoneNumberId,
      wabaId,
      displayPhone: phone.display_phone_number?.trim() || null,
      verifiedName: phone.verified_name?.trim() || null,
    };
  } catch {
    return { connected: true, displayPhone: null, verifiedName: null, phoneNumberId, wabaId };
  }
}

async function exchangeCode(code: string, appId: string, appSecret: string): Promise<string> {
  const response = await fetch(`${GRAPH}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.text();
  if (!response.ok) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    throw new Error(metaConnectionError(response.status, parsed));
  }
  return readOAuthAccessToken(body);
}

async function debugGranularScopes(accessToken: string, appId: string): Promise<GranularScope[]> {
  const appSecret = process.env["META_APP_SECRET"]?.trim();
  if (!appSecret) throw new Error("A conexão oficial aguarda a configuração do aplicativo Meta.");
  const url = new URL(`${GRAPH}/debug_token`);
  url.searchParams.set("input_token", accessToken);
  url.searchParams.set("access_token", `${appId}|${appSecret}`);
  const json = await graphGet<GraphErrorBody & { data?: { granular_scopes?: GranularScope[] } }>(url);
  return json.data?.granular_scopes ?? [];
}

interface PhoneNumberPage {
  data?: GraphPhoneNumber[];
  paging?: { next?: string };
}

async function listPhoneNumbers(wabaId: string, accessToken: string): Promise<GraphPhoneNumber[]> {
  const phones: GraphPhoneNumber[] = [];
  let url: URL | null = new URL(`${GRAPH}/${wabaId}/phone_numbers`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  for (let page = 0; page < 3 && url; page += 1) {
    const json: PhoneNumberPage = await graphGet<PhoneNumberPage>(url, accessToken);
    phones.push(...(json.data ?? []));
    const next: string | undefined = json.paging?.next;
    url = next ? assertGraphUrl(next) : null;
  }
  return phones;
}

async function fetchPhone(phoneNumberId: string, accessToken: string): Promise<GraphPhoneNumber> {
  const url = new URL(`${GRAPH}/${phoneNumberId}`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  const json = await graphGet<GraphPhoneNumber>(url, accessToken);
  return { ...json, id: digitId(json.id) ?? phoneNumberId };
}

export async function subscribeWhatsAppWebhookFields(
  wabaId: string,
  accessToken: string,
): Promise<void> {
  const verifyToken = process.env.META_VERIFY_TOKEN?.trim();
  if (!verifyToken) {
    throw new Error("META_VERIFY_TOKEN não configurado no servidor — necessário para ecoo na coexistência.");
  }
  const callbackUrl = serverWhatsAppWebhookUrl();

  // 1) Garante que o app está inscrito na WABA.
  const base = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!base.ok) {
    let parsed: unknown = null;
    try {
      parsed = await base.json();
    } catch {
      parsed = null;
    }
    throw new Error(metaConnectionError(base.status, parsed));
  }

  // 2) Override + campos (ecoo do celular vai direto para o painel).
  const response = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      override_callback_uri: callbackUrl,
      verify_token: verifyToken,
      subscribed_fields: [...META_WHATSAPP_WEBHOOK_FIELDS],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (response.ok) return;
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  throw new Error(metaConnectionError(response.status, parsed));
}

async function subscribeApp(wabaId: string, accessToken: string): Promise<void> {
  await subscribeWhatsAppWebhookFields(wabaId, accessToken);
}

async function assertPhoneAvailable(organizationId: string, phoneNumberId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("organization_id")
    .eq("phone_number_id", phoneNumberId)
    .neq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Não foi possível conferir se este número já está em uso.");
  if (data) throw new Error("Este número já está vinculado a outra agência.");
}

async function saveOfficialChannel(
  organizationId: string,
  input: { wabaId: string; phoneNumberId: string; accessToken: string },
): Promise<void> {
  const patch = {
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    access_token: input.accessToken,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE)
    .select("id");
  if (error) throw saveError(error);
  if ((data ?? []).length > 0) return;
  const { error: insertError } = await supabaseAdmin.from("whatsapp_channels").insert({
    organization_id: organizationId,
    line: OFFICIAL_LINE,
    label: "Guatá — WhatsApp Oficial",
    ...patch,
  });
  if (insertError) throw saveError(insertError);
}

function saveError(error: { code?: string; message: string }): Error {
  if (error.code === "23505" || /duplicate key/i.test(error.message)) {
    return new Error("Este número já está vinculado a outra agência.");
  }
  return new Error("Não foi possível salvar a conexão do WhatsApp.");
}

async function graphGet<T>(url: URL, accessToken?: string): Promise<T> {
  const response = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    signal: AbortSignal.timeout(20000),
  });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok) throw new Error(metaConnectionError(response.status, json));
  return json as T;
}

function assertGraphUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "graph.facebook.com") {
    throw new Error("A Meta devolveu um endereço inesperado.");
  }
  return url;
}

/** Reinscreve messages + ecoo na WABA (útil após conectar coexistência antes deste ajuste). */
export async function resubscribeCoexistenceWebhooksForOrg(
  organizationId: string,
): Promise<{ callbackUrl: string }> {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_channels")
    .select("waba_id, access_token")
    .eq("organization_id", organizationId)
    .eq("line", OFFICIAL_LINE)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const wabaId = digitId(data?.waba_id);
  const token = data?.access_token?.trim();
  if (!wabaId || !token) {
    throw new Error("WhatsApp oficial desta agência ainda não tem WABA e token salvos.");
  }
  await subscribeWhatsAppWebhookFields(wabaId, token);
  return { callbackUrl: serverWhatsAppWebhookUrl() };
}
