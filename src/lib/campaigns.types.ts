export type CampaignAudience =
  | "active_24h"
  | "active_7d"
  | "active_30d"
  | "all_sessions";

/** sessao = texto livre na janela de 24h. template = modelo aprovado, mesmo sem conversa aberta. */
export type CampaignSendMode = "sessao" | "template";

export type CampaignLine = "descubra" | "viagens";

/** Linha única ou disparo nas duas contas WhatsApp. */
export type CampaignLineSelect = CampaignLine | "both";

export interface CampaignRow {
  id: string;
  title: string;
  line: CampaignLine;
  body: string;
  image_path: string | null;
  audience: CampaignAudience;
  status: string;
  sent_ok: number;
  sent_fail: number;
  sent_skip: number;
  send_mode?: CampaignSendMode | null;
  template_name?: string | null;
  template_language?: string | null;
  template_uses_name?: boolean | null;
  extra_phones?: string | null;
  created_at: string;
  updated_at: string;
}
