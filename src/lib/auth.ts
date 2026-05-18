const KEY = "guata.channel.session";
const MAX_SESSION_AGE_MS = 8 * 60 * 60 * 1000; // 8 horas

export interface Session {
  email: string;
  name: string;
  token: string;
  loggedAt: string;
}

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.email || !session.token || !session.loggedAt) return null;
    const age = Date.now() - new Date(session.loggedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > MAX_SESSION_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    const apiUrl = import.meta.env.VITE_GUATA_API_URL as string | undefined;
    // Em build de produção, sessões mock não são aceitas.
    if (import.meta.env.PROD && session.token === "mock") {
      localStorage.removeItem(KEY);
      return null;
    }
    if (apiUrl && session.token === "mock") {
      localStorage.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getAuthToken(): string | null {
  return getSession()?.token ?? null;
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

/** Login mock (sem API). */
export function signInMock(email: string): Session {
  const session: Session = {
    email,
    name: email.split("@")[0] || "Consultor",
    token: "mock",
    loggedAt: new Date().toISOString(),
  };
  saveSession(session);
  return session;
}

export function signOut() {
  localStorage.removeItem(KEY);
}
