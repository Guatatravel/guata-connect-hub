CREATE TABLE public.passhub_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  api_key text,
  mod_aereo boolean NOT NULL DEFAULT true,
  mod_hotel boolean NOT NULL DEFAULT true,
  mod_seguro boolean NOT NULL DEFAULT true,
  mod_rodoviario boolean NOT NULL DEFAULT false,
  auto_search boolean NOT NULL DEFAULT false,
  auto_payment boolean NOT NULL DEFAULT false,
  quote_validity_minutes integer NOT NULL DEFAULT 15 CHECK (quote_validity_minutes BETWEEN 5 AND 120),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only: the API key never reaches the browser; the panel reads/writes through server functions.
GRANT ALL ON public.passhub_settings TO service_role;

ALTER TABLE public.passhub_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.passhub_settings IS 'Passhub integration per organization. Accessed only by server code (service_role); no client policies on purpose.';