-- Pausa global do Guatá (só humano) por organização.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bot_paused_at timestamptz NULL;

COMMENT ON COLUMN public.organizations.bot_paused_at IS
  'Se preenchido, o bot não responde; conversas novas/ativas ficam em modo humano.';
