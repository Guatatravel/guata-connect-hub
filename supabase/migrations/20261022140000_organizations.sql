-- Organizações (agências) + canais WhatsApp + vínculo dos dados existentes à Guatá.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  is_guata boolean NOT NULL DEFAULT false,
  use_descubra_kb boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.organization_members (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);

CREATE TABLE public.whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line public.channel_line NOT NULL,
  label text NOT NULL DEFAULT '',
  waba_id text,
  phone_number_id text,
  access_token text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, line)
);

CREATE TRIGGER trg_whatsapp_channels_updated
  BEFORE UPDATE ON public.whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.organizations (name, slug, is_guata, use_descubra_kb)
VALUES ('Guatá Viagens', 'guata', true, true);

-- Colunas de organização
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.attendants
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.channel_settings
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill org Guatá
UPDATE public.sessions SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'guata' LIMIT 1)
  WHERE organization_id IS NULL;
UPDATE public.attendants SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'guata' LIMIT 1)
  WHERE organization_id IS NULL;
UPDATE public.knowledge_documents SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'guata' LIMIT 1)
  WHERE organization_id IS NULL;
UPDATE public.channel_settings SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'guata' LIMIT 1)
  WHERE organization_id IS NULL;

-- Staff existente entra na org Guatá
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, ur.user_id, 'admin'
FROM public.organizations o
CROSS JOIN public.user_roles ur
WHERE o.slug = 'guata'
ON CONFLICT DO NOTHING;

-- Canais placeholder (credenciais via painel ou env)
INSERT INTO public.whatsapp_channels (organization_id, line, label)
SELECT o.id, 'descubra', 'Descubra MS'
FROM public.organizations o WHERE o.slug = 'guata'
ON CONFLICT (organization_id, line) DO NOTHING;

INSERT INTO public.whatsapp_channels (organization_id, line, label)
SELECT o.id, 'viagens', 'Guatá Viagens'
FROM public.organizations o WHERE o.slug = 'guata'
ON CONFLICT (organization_id, line) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_sessions_org ON public.sessions(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_channels TO authenticated;
GRANT ALL ON public.whatsapp_channels TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff le organizations" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff le members" ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff le channels" ON public.whatsapp_channels FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "admin gerencia channels" ON public.whatsapp_channels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
