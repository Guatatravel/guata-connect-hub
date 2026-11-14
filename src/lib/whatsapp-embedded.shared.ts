/** Regras puras do cadastro incorporado (coexistência). Sem rede e sem segredos. */

export const EMBEDDED_SIGNUP_CONFIG_ID = "1148937487787969";
export const GRAPH_VERSION = "v21.0";
export const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const FACEBOOK_MESSAGE_ORIGINS = [
  "https://www.facebook.com",
  "https://web.facebook.com",
] as const;

const WABA_SCOPES = new Set(["whatsapp_business_management", "whatsapp_business_messaging"]);

export interface EmbeddedSignupSession {
  event: string;
  wabaId?: string;
  phoneNumberId?: string;
  currentStep?: string;
  errorMessage?: string;
}

export interface GraphPhoneNumber {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
}

export interface GranularScope {
  scope?: string;
  target_ids?: string[];
}

export interface WhatsAppConnectionView {
  connected: boolean;
  displayPhone: string | null;
  verifiedName: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
}

export function embeddedLoginOptions(configId = EMBEDDED_SIGNUP_CONFIG_ID) {
  return {
    config_id: configId,
    response_type: "code" as const,
    override_default_response_type: true,
    extras: {
      feature: "whatsapp_embedded_signup" as const,
      version: 2 as const,
      sessionInfoVersion: 2 as const,
    },
  };
}

export function digitId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d{5,32}$/.test(value)) return value;
  return undefined;
}

/** Lê o postMessage WA_EMBEDDED_SIGNUP. Ignora outras origens e outros eventos. */
export function parseEmbeddedSignupMessage(origin: string, data: unknown): EmbeddedSignupSession | null {
  if (!FACEBOOK_MESSAGE_ORIGINS.includes(origin as (typeof FACEBOOK_MESSAGE_ORIGINS)[number])) return null;
  let payload: unknown = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== "WA_EMBEDDED_SIGNUP") return null;
  const inner =
    record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const errorMessage =
    typeof inner.error_message === "string"
      ? inner.error_message
      : typeof record.error_message === "string"
        ? record.error_message
        : undefined;
  return {
    event: typeof record.event === "string" ? record.event : "",
    wabaId: digitId(inner.waba_id),
    phoneNumberId: digitId(inner.phone_number_id),
    currentStep: typeof inner.current_step === "string" ? inner.current_step : undefined,
    errorMessage,
  };
}

export function wabaIdsFromScopes(scopes: GranularScope[] | undefined): string[] {
  const ids = new Set<string>();
  for (const scope of scopes ?? []) {
    if (!scope.scope || !WABA_SCOPES.has(scope.scope)) continue;
    for (const id of scope.target_ids ?? []) {
      const parsed = digitId(id);
      if (parsed) ids.add(parsed);
    }
  }
  return [...ids];
}

/**
 * Prefere o WABA que a janela da Meta devolveu. Se os escopos do token listam
 * contas e essa não está entre elas, recusa. Sem id no cliente, exige uma única conta.
 */
export function pickWabaId(preferred: string | undefined, scopes: GranularScope[] | undefined): string {
  const ids = wabaIdsFromScopes(scopes);
  if (preferred) {
    if (ids.length > 0 && !ids.includes(preferred)) {
      throw new Error("A conta WhatsApp informada não pertence a esta autorização.");
    }
    return preferred;
  }
  if (ids.length === 1) return ids[0]!;
  if (ids.length === 0) {
    throw new Error("A Meta não informou a conta WhatsApp Business. Conclua o cadastro novamente.");
  }
  throw new Error("Há mais de uma conta WhatsApp nesta autorização. Conclua o cadastro escolhendo uma conta.");
}

export function pickPhoneNumber(preferred: string | undefined, phones: GraphPhoneNumber[]): GraphPhoneNumber {
  const usable = phones.filter((phone) => digitId(phone.id));
  if (preferred) {
    const match = usable.find((phone) => phone.id === preferred);
    if (!match) throw new Error("O número escolhido não está nesta conta WhatsApp.");
    return match;
  }
  if (usable.length === 1) return usable[0]!;
  if (usable.length === 0) throw new Error("Nenhum número foi encontrado nesta conta WhatsApp.");
  throw new Error("Há mais de um número nesta conta. Conclua o cadastro escolhendo o número da agência.");
}

/** O navegador só recebe o número e os ids. O token fica de fora de propósito. */
export function publicWhatsAppConnection(input: {
  accessToken?: string;
  phoneNumberId: string;
  wabaId: string;
  displayPhone?: string | null;
  verifiedName?: string | null;
}): WhatsAppConnectionView {
  return {
    connected: true,
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    displayPhone: input.displayPhone?.trim() || null,
    verifiedName: input.verifiedName?.trim() || null,
  };
}

export function metaConnectionError(status: number, body: unknown): string {
  const message = graphErrorText(body);
  if (/authorization code|code has expired|has been used|invalid code/i.test(message)) {
    return "A autorização expirou ou já foi usada. Clique em conectar novamente.";
  }
  if (status === 401 || status === 403 || /permission|oauth/i.test(message)) {
    return "A Meta não concedeu as permissões do WhatsApp. Confirme o acesso na janela da Meta.";
  }
  return "A Meta não concluiu a conexão. Tente novamente em instantes.";
}

export function readOAuthAccessToken(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A Meta não devolveu o token de acesso.");
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error("A Meta não devolveu o token de acesso.");
    }
    if (json && typeof json === "object" && "error" in json) {
      throw new Error(metaConnectionError(400, json));
    }
    const token =
      json && typeof json === "object" && "access_token" in json
        ? (json as { access_token?: unknown }).access_token
        : undefined;
    if (typeof token !== "string" || token.length < 8) {
      throw new Error("A Meta não devolveu o token de acesso.");
    }
    return token;
  }
  const token = new URLSearchParams(trimmed).get("access_token");
  if (!token || token.length < 8) throw new Error("A Meta não devolveu o token de acesso.");
  return token;
}

export function embeddedSignupToast(session: EmbeddedSignupSession | null, closedWithoutCode: boolean): string | null {
  if (session?.event === "CANCEL") {
    return "Conexão cancelada na janela da Meta. Você pode tentar de novo quando quiser.";
  }
  if (session?.event === "ERROR") {
    return "A Meta recusou a autorização. Confirme as permissões e tente novamente.";
  }
  if (closedWithoutCode) return "A janela da Meta foi fechada antes de concluir a conexão.";
  return null;
}

function graphErrorText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const error = (body as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" ? error.message : "";
}
