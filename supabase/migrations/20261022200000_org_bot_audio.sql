-- Add-on voz no WhatsApp: permissão por agência, teto mensal e uso.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS allow_bot_audio boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_audio_monthly_cap integer,
  ADD COLUMN IF NOT EXISTS bot_audio_client_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.allow_bot_audio IS 'Agência pode oferecer TTS no WhatsApp (add-on).';
COMMENT ON COLUMN public.organizations.bot_audio_monthly_cap IS 'Máx. áudios/mês; NULL = ilimitado (ex.: Guatá).';
COMMENT ON COLUMN public.organizations.bot_audio_client_default IS 'Novas conversas começam com áudio ligado (cliente pode desligar).';

UPDATE public.organizations
SET
  allow_bot_audio = true,
  bot_audio_monthly_cap = NULL,
  bot_audio_client_default = true
WHERE is_guata = true;

CREATE TABLE IF NOT EXISTS public.organization_tts_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month_key text NOT NULL,
  audio_count integer NOT NULL DEFAULT 0,
  characters_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, month_key)
);

CREATE INDEX IF NOT EXISTS idx_org_tts_usage_month ON public.organization_tts_usage(month_key);
