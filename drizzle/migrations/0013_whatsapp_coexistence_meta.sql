ALTER TABLE public.whatsapp_channels
  ADD COLUMN IF NOT EXISTS coexistence_meta jsonb NOT NULL DEFAULT '{}'::jsonb;