import {
  mockChannelPosts,
  mockConversations,
  mockServices,
  mockSettings,
  mockTriages,
} from "@/lib/mocks/data";
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
const USE_MOCK = !API_URL;

// In-memory mutable mock state (per session)
const state = {
  triages: [...mockTriages],
  conversations: [...mockConversations],
  posts: [...mockChannelPosts],
  services: [...mockServices],
  settings: { ...mockSettings },
};

const delay = (ms = 350 + Math.random() * 300) =>
  new Promise((r) => setTimeout(r, ms));

async function call<T>(_path: string, fallback: () => T | Promise<T>): Promise<T> {
  if (USE_MOCK) {
    await delay();
    return fallback();
  }
  const res = await fetch(`${API_URL}${_path}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const api = {
  async getDashboardStats(): Promise<DashboardStats> {
    return call("/admin/dashboard/stats", () => {
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
    return call("/admin/triages", () => {
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
    });
  },

  async getTriage(id: string): Promise<TravelIntake | undefined> {
    return call(`/admin/triages/${id}`, () =>
      state.triages.find((t) => t.id === id),
    );
  },

  async updateTriage(
    id: string,
    patch: Partial<TravelIntake>,
  ): Promise<TravelIntake> {
    return call(`/admin/triages/${id}`, () => {
      const idx = state.triages.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error("Triagem não encontrada");
      state.triages[idx] = {
        ...state.triages[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return state.triages[idx];
    });
  },

  async assumeTriage(id: string, consultor: string): Promise<TravelIntake> {
    return api.updateTriage(id, { assignedTo: consultor, status: "atribuido" });
  },

  async releaseBot(id: string): Promise<TravelIntake> {
    return call(`/admin/triages/${id}/release-bot`, () => {
      const t = state.triages.find((t) => t.id === id);
      if (!t) throw new Error("não encontrada");
      // also flip conversation back to bot
      const conv = state.conversations.find((c) => c.phone === t.phone);
      if (conv) conv.mode = "informacional";
      return t;
    });
  },

  async listConversations(): Promise<Conversation[]> {
    return call("/admin/conversations", () =>
      [...state.conversations].sort((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt),
      ),
    );
  },

  async getConversation(id: string): Promise<Conversation | undefined> {
    return call(`/admin/conversations/${id}`, () =>
      state.conversations.find((c) => c.id === id),
    );
  },

  async replyConversation(id: string, text: string): Promise<Conversation> {
    return call(`/admin/conversations/${id}/reply`, () => {
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
    });
  },

  async listChannelPosts(): Promise<ChannelPost[]> {
    return call("/admin/channel-posts", () =>
      [...state.posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },

  async updateChannelPost(
    id: string,
    patch: Partial<ChannelPost>,
  ): Promise<ChannelPost> {
    return call(`/admin/channel-posts/${id}`, () => {
      const idx = state.posts.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error("post não encontrado");
      state.posts[idx] = { ...state.posts[idx], ...patch };
      return state.posts[idx];
    });
  },

  async listServices(): Promise<AgencyService[]> {
    return call("/admin/agency-services", () => [...state.services]);
  },

  async upsertService(svc: AgencyService): Promise<AgencyService> {
    return call(`/admin/agency-services/${svc.id}`, () => {
      const idx = state.services.findIndex((s) => s.id === svc.id);
      if (idx === -1) state.services.push(svc);
      else state.services[idx] = svc;
      return svc;
    });
  },

  async deleteService(id: string): Promise<void> {
    return call(`/admin/agency-services/${id}`, () => {
      state.services = state.services.filter((s) => s.id !== id);
    });
  },

  async getSettings(): Promise<ChannelSettings> {
    return call("/admin/settings", () => state.settings);
  },

  async updateSettings(patch: Partial<ChannelSettings>): Promise<ChannelSettings> {
    return call("/admin/settings", () => {
      state.settings = { ...state.settings, ...patch };
      return state.settings;
    });
  },
};

export const isUsingMock = USE_MOCK;