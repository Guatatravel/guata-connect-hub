const KEY = "guata.channel.session";

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
    if (!session.email) return null;
    const apiUrl = import.meta.env.VITE_GUATA_API_URL as string | undefined;
    if (apiUrl && !session.token) return null;
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
