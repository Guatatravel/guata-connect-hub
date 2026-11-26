-- Chave ElevenLabs por agência (somente servidor / service_role).
ALTER TABLE public.organization_ai_settings
  ADD COLUMN IF NOT EXISTS use_own_elevenlabs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key text NULL,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_male_id text NULL,
  ADD COLUMN IF NOT EXISTS elevenlabs_voice_female_id text NULL;

COMMENT ON COLUMN public.organization_ai_settings.elevenlabs_api_key IS
  'Chave ElevenLabs da agência. Só o servidor lê.';
COMMENT ON COLUMN public.organization_ai_settings.use_own_elevenlabs IS
  'Se true e houver chave, o BOT usa a voz da agência; senão cai no ELEVENLABS_API_KEY do servidor.';
