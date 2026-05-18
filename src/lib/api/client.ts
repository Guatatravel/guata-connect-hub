import {
  mockChannelPosts,
  mockConversations,
  mockServices,
  mockSettings,
  mockTriages,
} from "@/lib/mocks/data";
import { getAuthToken, signOut } from "@/lib/auth";
import type {
  AgencyService,
  ChannelPost,
  ChannelSettings,
  Conversation,
  DashboardStats,
  TravelIntake,
  TriagemStatus,
} from "@/types/guata";

const API_URL = import.meta.env.VITE_GUATA_API_URL as string | undefined;
export const isUsingMock = !API_URL;

// Em produção, nunca permitir o modo mock — exige API real.
if (import.meta.env.PROD && isUsingMock && typeof console !== "undefined") {
  console.error(
    "[guata] VITE_GUATA_API_URL não definida em build de produção. Login mock está bloqueado.",
  );
}

const state = {
  triages: [...mockTriages],
  conversations: [...mockConversations],
  posts: [...mockChannelPosts],
  services: [...mockServices],
  settings: { ...mockSettings },
};

const delay = (ms = 350 + Math.random() * 300) =>
  new Promise((r) => setTimeout(r, ms));

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | undefined>;
};

async function request<T>(
  path: string,
  options: RequestOptions = {},
  fallback?: () => T | Promise<T>,
): Promise<T> {
  if (isUsingMock) {
    if (!fallback) throw new Error("Mock fallback required");
    await delay();
    return fallback();
  }

  const { method = "GET", body, query } = options;
  const url = new URL(path, API_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "" && v !== "all") url.searchParams.set(k, v);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    signOut();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Sessão expirada");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg =
      (err as { error?: string }).error ?? `Erro na API (${res.status})`;
    throw new Error(msg);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  async login(
    email: string,
    password: string,
  ): Promise<{ token: string; user: { email: string; name: string } }> {
    if (isUsingMock) {
      if (import.meta.env.PROD) {
        throw new Error(
          "Configuração ausente: API não definida para produção.",
        );
      }
      await delay();
      return {
        token: "mock",
        user: { email, name: email.split("@")[0] || "Consultor" },
      };
    }
    const res = await fetch(`${API_URL}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        (err as { error?: string }).error ?? "Email ou senha inválidos",
      );
    }
    return res.json();
  },

  async getDashboardStats(): Promise<DashboardStats> {
    return request("/admin/dashboard/stats", {}, () => {
      const ultimasTriagens = [...state.triages]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
      const today = new Date().toISOString().slice(0, 10);
      return {
        triagensHoje: state.triages.filter((t) => t.createdAt.startsWith(today))
          .length,
        aguardandoConsultor: state.triages.filter((t) => t.status === "novo")
          .length,
        emAtendimentoHumano: state.conversations.filter((c) => c.mode === "humano")
          .length,
        conversasAtivas: state.conversations.length,
        postsPendentes: state.posts.filter((p) => p.status === "rascunho").length,
        ultimasTriagens,
      };
    });
  },

  async listTriages(filters?: {
    status?: TriagemStatus | "all";
    line?: string;
    consultor?: string;
    destino?: string;
  }): Promise<TravelIntake[]> {
    return request(
      "/admin/triages",
      {
        query: {
          status: filters?.status,
          line: filters?.line,
          consultor: filters?.consultor,
          destino: filters?.destino,
        },
      },
      () => {
        let rows = [...state.triages];
        if (filters?.status && filters.status !== "all")
          rows = rows.filter((t) => t.status === filters.status);
        if (filters?.line && filters.line !== "all")
          rows = rows.filter((t) => t.line === filters.line);
        if (filters?.consultor && filters.consultor !== "all")
          rows = rows.filter((t) => t.assignedTo === filters.consultor);
        if (filters?.destino)
          rows = rows.filter((t) =>
            t.destino.toLowerCase().includes(filters.destino!.toLowerCase()),
          );
        return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      },
    );
  },

  async getTriage(id: string): Promise<TravelIntake | undefined> {
    return request(`/admin/triages/${id}`, {}, () =>
      state.triages.find((t) => t.id === id),
    );
  },

  async updateTriage(
    id: string,
    patch: Partial<TravelIntake>,
  ): Promise<TravelIntake> {
    return request(
      `/admin/triages/${id}`,
      { method: "PATCH", body: patch },
      () => {
        const idx = state.triages.findIndex((t) => t.id === id);
        if (idx === -1) throw new Error("Triagem não encontrada");
        state.triages[idx] = {
          ...state.triages[idx],
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        return state.triages[idx];
      },
    );
  },

  async assumeTriage(id: string, consultor: string): Promise<TravelIntake> {
    return request(
      `/admin/triages/${id}/assume`,
      { method: "POST", body: { consultor } },
      () => api.updateTriage(id, { assignedTo: consultor, status: "atribuido" }),
    );
  },

  async releaseBot(id: string): Promise<TravelIntake> {
    return request(
      `/admin/triages/${id}/release-bot`,
      { method: "POST" },
      () => {
        const t = state.triages.find((t) => t.id === id);
        if (!t) throw new Error("não encontrada");
        const conv = state.conversations.find((c) => c.phone === t.phone);
        if (conv) conv.mode = "informacional";
        return t;
      },
    );
  },

  async listConversations(): Promise<Conversation[]> {
    return request("/admin/conversations", {}, () =>
      [...state.conversations].sort((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt),
      ),
    );
  },

  async getConversation(id: string): Promise<Conversation | undefined> {
    return request(`/admin/conversations/${id}`, {}, () =>
      state.conversations.find((c) => c.id === id),
    );
  },

  async replyConversation(id: string, text: string): Promise<Conversation> {
    return request(
      `/admin/conversations/${id}/reply`,
      { method: "POST", body: { text } },
      () => {
        const conv = state.conversations.find((c) => c.id === id);
        if (!conv) throw new Error("não encontrada");
        conv.messages.push({
          id: `m${conv.messages.length + 1}`,
          role: "human",
          text,
          at: new Date().toISOString(),
        });
        conv.lastMessage = text;
        conv.lastMessageAt = new Date().toISOString();
        conv.mode = "humano";
        return conv;
      },
    );
  },

  async listChannelPosts(): Promise<ChannelPost[]> {
    return request("/admin/channel-posts", {}, () =>
      [...state.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },

  async updateChannelPost(
    id: string,
    patch: Partial<ChannelPost>,
  ): Promise<ChannelPost> {
    return request(
      `/admin/channel-posts/${id}`,
      { method: "PATCH", body: patch },
      () => {
        const idx = state.posts.findIndex((p) => p.id === id);
        if (idx === -1) throw new Error("post não encontrado");
        state.posts[idx] = { ...state.posts[idx], ...patch };
        return state.posts[idx];
      },
    );
  },

  async listServices(): Promise<AgencyService[]> {
    return request("/admin/agency-services", {}, () => [...state.services]);
  },

  async upsertService(svc: AgencyService): Promise<AgencyService> {
    return request(
      `/admin/agency-services/${svc.id}`,
      { method: "PUT", body: svc },
      () => {
        const idx = state.services.findIndex((s) => s.id === svc.id);
        if (idx === -1) state.services.push(svc);
        else state.services[idx] = svc;
        return svc;
      },
    );
  },

  async deleteService(id: string): Promise<void> {
    return request(
      `/admin/agency-services/${id}`,
      { method: "DELETE" },
      () => {
        state.services = state.services.filter((s) => s.id !== id);
      },
    );
  },

  async getSettings(): Promise<ChannelSettings> {
    return request("/admin/settings", {}, () => state.settings);
  },

  async updateSettings(
    patch: Partial<ChannelSettings>,
  ): Promise<ChannelSettings> {
    return request(
      "/admin/settings",
      { method: "PATCH", body: patch },
      () => {
        state.settings = { ...state.settings, ...patch };
        return state.settings;
      },
    );
  },
};
