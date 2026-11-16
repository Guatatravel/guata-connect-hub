ALTER TABLE public.organization_ai_settings
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'auto';

COMMENT ON COLUMN public.organization_ai_settings.ai_provider IS 'auto, gemini ou lovable — só o servidor lê.';

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text NOT NULL DEFAULT 'MARKETING',
  status text NOT NULL DEFAULT 'PENDING',
  body_text text NOT NULL DEFAULT '',
  meta_template_id text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name, language)
);

ALTER TABLE public.instagram_oauth_attempts
  ADD COLUMN IF NOT EXISTS error_message text;

GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;