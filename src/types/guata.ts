export type WhatsAppLine = "descubra_ms" | "guata_viagens";

export type SessionMode = "informacional" | "triagem" | "humano" | "aguardando";

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
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "bot" | "human";
  text: string;
  at: string;
}

export interface Conversation {
  id: string;
  phone: string;
  contactName?: string;
  line: WhatsAppLine;
  mode: SessionMode;
  lastMessageAt: string;
  lastMessage: string;
  unread?: number;
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
  regioes: string[];
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
  webhookDescubraUrl: string;
  webhookViagensUrl: string;
  mensagemBoasVindas: string;
  palavrasGatilhoTriagem: string[];
}

export const CONSULTORES = [
  "Ana Souza",
  "Bruno Lima",
  "Carla Pires",
  "Diego Mendes",
] as const;