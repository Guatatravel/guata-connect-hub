-- Gênero do agente (persona) e voz TTS no WhatsApp por atendente.

ALTER TABLE public.attendants
  ADD COLUMN IF NOT EXISTS agent_gender text NOT NULL DEFAULT 'male',
  ADD COLUMN IF NOT EXISTS tts_voice_profile text NOT NULL DEFAULT 'male';

ALTER TABLE public.attendants
  DROP CONSTRAINT IF EXISTS attendants_agent_gender_check;

ALTER TABLE public.attendants
  ADD CONSTRAINT attendants_agent_gender_check
  CHECK (agent_gender IN ('male', 'female'));

ALTER TABLE public.attendants
  DROP CONSTRAINT IF EXISTS attendants_tts_voice_profile_check;

ALTER TABLE public.attendants
  ADD CONSTRAINT attendants_tts_voice_profile_check
  CHECK (tts_voice_profile IN ('male', 'female'));

COMMENT ON COLUMN public.attendants.agent_gender IS 'Tom da persona: masculino ou feminino.';
COMMENT ON COLUMN public.attendants.tts_voice_profile IS 'Voz TTS no WhatsApp: male ou female.';
