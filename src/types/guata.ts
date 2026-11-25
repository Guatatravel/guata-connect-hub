export type WhatsAppLine = "descubra_ms" | "guata_viagens";

export type SessionMode = "informacional" | "triagem" | "humano" | "aguardando";

export type LeadStage = "informacional" | "qualificando" | "quente";

export type TriagemStatus =
  | "novo"
  | "atribuido"
  | "contactado"
  | "proposta_enviada"
  | "fechado"
  | "perdido";

export type ChannelPostStatus = "rascunho" | "publicado" | "ignorado";

export interface TravelIntake {
  id: string;
  protocol: string;
  name: string;
  phone: string;
  line: WhatsAppLine;
  destino: string;
  dataIda: string;
  dataVolta: string;
  viajantes: number;
  faixaOrcamento: string;
  origem?: string;
  preferencias?: string;
  status: TriagemStatus;
  assignedTo?: string;
  assignedToName?: string;
  sessionId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatMediaKind = "image" | "audio" | "video" | "document";

export interface ChatMessage {
  id: string;
  role: "user" | "bot" | "human";
  authorName?: string;
  text: string;
  at: string;
  mediaKind?: ChatMediaKind;
  mediaUrl?: string;
  mediaMime?: string;
  mediaFilename?: string;
  /** Id da mensagem na Meta. Sem ele, o painel não consegue citar no WhatsApp. */
  waMessageId?: string;
  /** sent | delivered | read | failed — recibo da Meta, qualquer tipo de mensagem. */
  deliveryStatus?: "sent" | "delivered" | "read" | "failed";
  deliveryError?: string;
  /** Áudio de voz gerado pelo Guatá, mesmo quando o arquivo antigo não foi guardado. */
  outboundKind?: string;
  replyTo?: { authorLabel: string; text: string };
  /** Apagada para todos (painel ou WhatsApp). */
  deleted?: boolean;
  /** Texto alterado após envio. */
  edited?: boolean;
  /** Reações estilo WhatsApp (emoji por autor no balão alvo). */
  reactions?: Record<string, string>;
}

export interface Conversation {
  id: string;
  phone: string;
  contactName?: string;
  line: WhatsAppLine;
  mode: SessionMode;
  lastMessageAt: string;
  createdAt?: string;
  assignedToName?: string;
  lastMessage: string;
  unread?: number;
  archived?: boolean;
  unseen?: boolean;
  leadStage?: LeadStage;
  triagemProtocol?: string;
  openTriage?: {
    protocol: string;
    status: string;
    destino: string;
    staffSeenAt: string | null;
  };
  /** Fila humana ou triagem nova ainda não vista. */
  needsAttention?: boolean;
  crmGuide?: string;
  crmLabels?: string[];
  crmColumn?: "interessados" | "orcamento" | "fechado";
  followUp?: {
    dueAt: string;
    text: string;
    templateName?: string;
    status: "pending" | "sent" | "skipped" | "paused";
    detail?: string;
    stepIndex?: number;
    steps?: Array<{
      delay: number;
      unit: "minutes" | "hours" | "days";
      text: string;
      templateName?: string;
    }>;
    history?: Array<{
      stepIndex: number;
      at: string;
      status: "sent" | "skipped" | "error";
      detail?: string;
      text?: string;
    }>;
  };
  /** Resumo da oferta do grupo / story (intake group_offer). */
  groupOfferNote?: string;
  /** Não receber campanhas / follow-up. */
  doNotContact?: boolean;
  doNotContactReason?: "declined_invite" | "manual" | "client_request" | "deleted";
  /** Já recusou modelo/convite (mesmo legado). */
  declinedInvite?: boolean;
  messages: ChatMessage[];
}

export interface ChannelPost {
  id: string;
  eventId: string;
  thumbnail: string;
  title: string;
  eventDate: string;
  city: string;
  link: string;
  body: string;
  status: ChannelPostStatus;
  createdAt: string;
}

export interface AgencyService {
  id: string;
  nome: string;
  descricao: string;
  categoria?: string;
  keywords: string[];
  ativo: boolean;
}

export interface DashboardStats {
  triagensHoje: number;
  aguardandoConsultor: number;
  emAtendimentoHumano: number;
  conversasAtivas: number;
  postsPendentes: number;
  ultimasTriagens: TravelIntake[];
}

export interface ChannelSettings {
  metaStatus: "conectado" | "desconectado";
  metaConfiguredDescubra: boolean;
  metaConfiguredViagens: boolean;
  descubraSupabaseConfigured: boolean;
  descubraWebhookSecretConfigured: boolean;
  descubraCanalWebhookReady: boolean;
  personaDescubra: string;
  personaViagens: string;
  horarioAtendimento: string;
  mensagemForaHorario: string;
  mensagemHumano: string;
  isGuataOrg?: boolean;
  useDescubraKb?: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
}