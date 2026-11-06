CREATE TABLE public.instagram_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  ig_account_id text,
  access_token text,
  whatsapp_number text,
  keywords text[] NOT NULL DEFAULT ARRAY['quero','eu quero','valor','roteiro','pacote','preço','preco'],
  reply_any_question boolean NOT NULL DEFAULT false,
  comment_replies text[] NOT NULL DEFAULT ARRAY['Oi @{nome}, te chamei no Direct! ✨','@{nome} acabei de te mandar os detalhes no Direct 😉','Oi @{nome}! Dá uma olhadinha no seu Direct 💚'],
  dm_extra text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.instagram_settings TO service_role;
ALTER TABLE public.instagram_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.instagram_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  comment_id text UNIQUE,
  media_id text,
  username text,
  text text,
  status text NOT NULL DEFAULT 'recebido',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.instagram_events TO service_role;
ALTER TABLE public.instagram_events ENABLE ROW LEVEL SECURITY;