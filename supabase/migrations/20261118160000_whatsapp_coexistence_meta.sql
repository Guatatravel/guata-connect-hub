ALTER TABLE public.whatsapp_channels
  ADD COLUMN IF NOT EXISTS coexistence_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.whatsapp_channels.coexistence_meta IS
  'Coexistência: connected_at, history sync status/progress (webhook history + smb_app_data).';
