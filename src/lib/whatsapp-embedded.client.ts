import {
  GRAPH_VERSION,
  embeddedLoginOptions,
  parseEmbeddedSignupMessage,
  type EmbeddedSignupSession,
} from "@/lib/whatsapp-embedded.shared";

interface FacebookAuthResponse {
  code?: string;
}

interface FacebookLoginResponse {
  status?: string;
  authResponse?: FacebookAuthResponse | null;
}

interface FacebookSdk {
  init: (options: { appId: string; version: string; xfbml: boolean }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: ReturnType<typeof embeddedLoginOptions>,
  ) => void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let sdkPromise: Promise<void> | null = null;
let initializedAppId: string | null = null;

export function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("O Facebook só abre no navegador."));
  if (window.FB && initializedAppId === appId) return Promise.resolve();
  if (!sdkPromise) {
    sdkPromise = new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (window.FB) resolve();
        else reject(new Error("Não foi possível carregar o Facebook."));
      };
      window.fbAsyncInit = finish;
      const existing = document.getElementById("facebook-jssdk");
      if (existing) {
        if (window.FB) finish();
        else window.setTimeout(finish, 1500);
        return;
      }
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.onerror = () => {
        sdkPromise = null;
        reject(new Error("Não foi possível carregar o Facebook. Recarregue a página."));
      };
      document.body.appendChild(script);
    });
  }
  return sdkPromise.then(() => {
    window.FB?.init({ appId, version: GRAPH_VERSION, xfbml: true });
    initializedAppId = appId;
  });
}

export function loginWithEmbeddedSignup(configId: string): Promise<FacebookLoginResponse> {
  const sdk = window.FB;
  if (!sdk) return Promise.reject(new Error("O Facebook ainda está carregando. Aguarde um instante e tente de novo."));
  return new Promise((resolve) => {
    sdk.login((response) => resolve(response), embeddedLoginOptions(configId));
  });
}

export function rememberEmbeddedSignupMessage(origin: string, data: unknown): EmbeddedSignupSession | null {
  return parseEmbeddedSignupMessage(origin, data);
}

/** O evento da Meta pode chegar milissegundos depois do código de autorização. */
export function waitForEmbeddedSession(
  read: () => EmbeddedSignupSession | null,
  timeoutMs = 2000,
): Promise<EmbeddedSignupSession | null> {
  const current = read();
  if (current?.wabaId || current?.phoneNumberId || current?.event === "CANCEL" || current?.event === "ERROR") {
    return Promise.resolve(current);
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const next = read();
      const settled = Boolean(next?.wabaId || next?.phoneNumberId || next?.event === "CANCEL" || next?.event === "ERROR");
      if (settled || Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        resolve(next);
      }
    }, 100);
  });
}
