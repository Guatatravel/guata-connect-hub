
-- Trigger helper de updated_at (já existe tg_set_updated_at, mas garante)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============== SESSIONS ==============
CREATE TYPE public.session_mode AS ENUM ('bot','humano','triagem','aguardando');
CREATE TYPE public.channel_line AS ENUM ('descubra','viagens');

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line public.channel_line NOT NULL,
  phone text NOT NULL,
  contact_name text,
  mode public.session_mode NOT NULL DEFAULT 'bot',
  intake_state text,
  intake_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line, phone)
);
CREATE INDEX idx_sessions_mode ON public.sessions(mode);
CREATE INDEX idx_sessions_last_msg ON public.sessions(last_message_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê sessions" ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth atualiza sessions" ON public.sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth insere sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== MESSAGES ==============
CREATE TYPE public.message_direction AS ENUM ('in','out');
CREATE TYPE public.message_author AS ENUM ('user','bot','agent','system');

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  direction public.message_direction NOT NULL,
  author public.message_author NOT NULL,
  text text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_session ON public.messages(session_id, created_at);

GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insere messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);

-- ============== TRAVEL INTAKE ==============
CREATE TABLE public.travel_intake (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  protocol text NOT NULL UNIQUE,
  origem text,
  destino text,
  data_ida date,
  data_volta date,
  adultos int DEFAULT 1,
  criancas int DEFAULT 0,
  orcamento_brl numeric(12,2),
  preferencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'aberta',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intake_status ON public.travel_intake(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_intake TO authenticated;
GRANT ALL ON public.travel_intake TO service_role;
ALTER TABLE public.travel_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê triagens" ON public.travel_intake FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth atualiza triagens" ON public.travel_intake FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth insere triagens" ON public.travel_intake FOR INSERT TO authenticated WITH CHECK (true);

CREATE TRIGGER trg_intake_updated BEFORE UPDATE ON public.travel_intake
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== CHANNEL POSTS ==============
CREATE TYPE public.channel_post_status AS ENUM ('rascunho','aprovado','publicado','arquivado');

CREATE TABLE public.channel_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'descubra-ms',
  external_id text,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  link_url text,
  event_starts_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.channel_post_status NOT NULL DEFAULT 'rascunho',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, external_id)
);
CREATE INDEX idx_posts_status ON public.channel_posts(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_posts TO authenticated;
GRANT ALL ON public.channel_posts TO service_role;
ALTER TABLE public.channel_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê posts" ON public.channel_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth atualiza posts" ON public.channel_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth insere posts" ON public.channel_posts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "admin deleta posts" ON public.channel_posts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_posts_updated BEFORE UPDATE ON public.channel_posts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== AGENCY SERVICES ==============
CREATE TABLE public.agency_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  categoria text,
  ativo boolean NOT NULL DEFAULT true,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agency_services TO authenticated;
GRANT ALL ON public.agency_services TO service_role;
ALTER TABLE public.agency_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê serviços" ON public.agency_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin gerencia serviços (i)" ON public.agency_services FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin gerencia serviços (u)" ON public.agency_services FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin gerencia serviços (d)" ON public.agency_services FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_services_updated BEFORE UPDATE ON public.agency_services
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== CHANNEL SETTINGS (linha única) ==============
CREATE TABLE public.channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  persona_descubra text NOT NULL DEFAULT 'Sou o Guatá, assistente turístico oficial de Mato Grosso do Sul.',
  persona_viagens text NOT NULL DEFAULT 'Sou consultor da agência Viagens MS.',
  horario_atendimento text NOT NULL DEFAULT 'Seg a Sex, 8h às 18h',
  mensagem_fora_horario text NOT NULL DEFAULT 'Recebemos sua mensagem! Retornamos em horário comercial.',
  mensagem_humano text NOT NULL DEFAULT 'Um consultor humano assumirá a conversa em instantes.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.channel_settings (singleton) VALUES (true);

GRANT SELECT ON public.channel_settings TO authenticated;
GRANT ALL ON public.channel_settings TO service_role;
ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth lê settings" ON public.channel_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin atualiza settings" ON public.channel_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.channel_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generator de protocolo VG-XXXX
CREATE OR REPLACE FUNCTION public.generate_protocol()
RETURNS text LANGUAGE sql AS $$
  SELECT 'VG-' || lpad((floor(random()*9000)+1000)::int::text, 4, '0')
$$;
