-- Org ativa no perfil + lookup único de Phone Number ID por canal.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_channels_phone_id
  ON public.whatsapp_channels (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND phone_number_id <> '';

CREATE INDEX IF NOT EXISTS idx_sessions_org_line_phone
  ON public.sessions (organization_id, line, phone);
