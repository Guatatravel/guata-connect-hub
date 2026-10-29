-- Parceiros: painel operacional só após liberação Guatá (self-signup cria org com access_liberado = false).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS access_liberado boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.access_liberado IS
  'Quando false, parceiro entra no painel mas WhatsApp/bot/conversas ficam bloqueados até admin liberar.';
