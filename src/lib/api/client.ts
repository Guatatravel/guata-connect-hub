/**
 * Façade para o painel — delega para as server fns em panel.functions.ts.
 * Mantém a API antiga (api.listX / api.getX / api.updateX) usada pelas telas.
 */
import {
  fetchDashboardStats,
  fetchConversations,
  fetchConversation,
  replyAsAgent,
  releaseBot,
  fetchTriages,
  fetchTriage,
  updateTriage,
  fetchChannelPosts,
  updateChannelPost,
  fetchSettings,
  updateSettings,
  fetchServices,
  upsertService,
  deleteService,
  fetchStaff,
} from "@/lib/panel.functions";
import type {
  AgencyService,
  ChannelPost,
  ChannelSettings,
  Conversation,
  TravelIntake,
  TriagemStatus,
  StaffMember,
} from "@/types/guata";

export const isUsingMock = false;

export const api = {
  async getDashboardStats() {
    return (await fetchDashboardStats()) as Awaited<ReturnType<typeof fetchDashboardStats>>;
  },

  async listConversations(): Promise<Conversation[]> {
    return (await fetchConversations()) as unknown as Conversation[];
  },

  async getConversation(id: string): Promise<Conversation | null> {
    return (await fetchConversation({ data: { id } })) as unknown as Conversation | null;
  },

  async replyConversation(id: string, text: string) {
    return replyAsAgent({ data: { id, text } });
  },

  async releaseBot(id: string) {
    return releaseBot({ data: { id } });
  },

  async listTriages(filters?: {
    status?: TriagemStatus | "all";
    line?: string;
    consultor?: string;
    destino?: string;
  }): Promise<TravelIntake[]> {
    return (await fetchTriages({ data: filters ?? {} })) as unknown as TravelIntake[];
  },

  async getTriage(id: string): Promise<TravelIntake | null> {
    return (await fetchTriage({ data: { id } })) as unknown as TravelIntake | null;
  },

  async updateTriage(id: string, patch: Partial<TravelIntake>) {
    await updateTriage({
      data: {
        id,
        status: patch.status,
        assignedTo: patch.assignedTo ?? null,
        notes: patch.notes,
      },
    });
    return { id, ...patch } as TravelIntake;
  },

  async assumeTriage(id: string, consultorId: string) {
    await updateTriage({
      data: { id, status: "atribuido", assignedTo: consultorId },
    });
    return { id } as TravelIntake;
  },

  async listChannelPosts(): Promise<ChannelPost[]> {
    return (await fetchChannelPosts()) as unknown as ChannelPost[];
  },

  async updateChannelPost(id: string, patch: Partial<ChannelPost>) {
    await updateChannelPost({ data: { id, status: patch.status ?? "rascunho" } });
    return { id, ...patch } as ChannelPost;
  },

  async listServices(): Promise<AgencyService[]> {
    return (await fetchServices()) as unknown as AgencyService[];
  },

  async upsertService(svc: AgencyService): Promise<AgencyService> {
    const isNew = !svc.id || svc.id.startsWith("s-");
    const res = await upsertService({
      data: {
        id: isNew ? undefined : svc.id,
        nome: svc.nome,
        descricao: svc.descricao ?? "",
        categoria: svc.categoria ?? "",
        keywords: svc.keywords ?? [],
        ativo: svc.ativo,
      },
    });
    return { ...svc, id: res.id };
  },

  async deleteService(id: string) {
    await deleteService({ data: { id } });
  },

  async getSettings(): Promise<ChannelSettings> {
    return (await fetchSettings()) as ChannelSettings;
  },

  async updateSettings(patch: Partial<ChannelSettings>): Promise<ChannelSettings> {
    await updateSettings({
      data: {
        personaDescubra: patch.personaDescubra,
        personaViagens: patch.personaViagens,
        horarioAtendimento: patch.horarioAtendimento,
        mensagemForaHorario: patch.mensagemForaHorario,
        mensagemHumano: patch.mensagemHumano,
      },
    });
    return (await fetchSettings()) as ChannelSettings;
  },

  async listStaff(): Promise<StaffMember[]> {
    return (await fetchStaff()) as StaffMember[];
  },
};