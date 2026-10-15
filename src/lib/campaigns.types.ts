export type CampaignAudience =
  | "active_24h"
  | "active_7d"
  | "active_30d"
  | "all_sessions";

export type CampaignLine = "descubra" | "viagens";

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
  created_at: string;
  updated_at: string;
}
