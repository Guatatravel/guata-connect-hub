-- Cota de IA por agência. A chave própria e o bloqueio ficam só no servidor.

CREATE TABLE IF NOT EXISTS public.organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  use_own_key boolean NOT NULL DEFAULT false,
  api_key text,
  credits_blocked_period text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_ai_usage (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, period_key)
);

CREATE TABLE IF NOT EXISTS public.platform_ai_policy (
  id integer PRIMARY KEY CHECK (id = 1),
  reply_cap integer,
  credits_blocked_period text
);

INSERT INTO public.platform_ai_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.organization_ai_settings TO service_role;
GRANT ALL ON public.organization_ai_usage TO service_role;
GRANT ALL ON public.platform_ai_policy TO service_role;

ALTER TABLE public.organization_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_ai_policy ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.organization_ai_settings IS 'Chave de IA da agência. Só o servidor lê. Sem política para o navegador.';
COMMENT ON TABLE public.platform_ai_policy IS 'Teto opcional de respostas das agências na chave da Guatá. NULL = sem teto inventado; a Lovable inclui 4 créditos de IA por mês para o app inteiro.';
