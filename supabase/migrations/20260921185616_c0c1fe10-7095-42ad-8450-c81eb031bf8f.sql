CREATE TABLE public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_type text NOT NULL DEFAULT 'texto',
  file_path text,
  url text,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pronto',
  error text,
  size_bytes integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT ALL ON public.knowledge_documents TO service_role;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff le documentos" ON public.knowledge_documents FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "staff insere documentos" ON public.knowledge_documents FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "staff atualiza documentos" ON public.knowledge_documents FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "admin apaga documentos" ON public.knowledge_documents FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_knowledge_documents_updated BEFORE UPDATE ON public.knowledge_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_knowledge_documents_created ON public.knowledge_documents (created_at DESC);

CREATE TABLE public.attendants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  line channel_line NOT NULL DEFAULT 'descubra',
  persona text NOT NULL DEFAULT '',
  tom text NOT NULL DEFAULT 'cordial',
  saudacao text NOT NULL DEFAULT '',
  despedida text NOT NULL DEFAULT '',
  palavras_humano text[] NOT NULL DEFAULT '{}'::text[],
  usa_base_local boolean NOT NULL DEFAULT true,
  usa_base_descubra boolean NOT NULL DEFAULT true,
  criatividade numeric NOT NULL DEFAULT 0.6,
  modelo text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendants TO authenticated;
GRANT ALL ON public.attendants TO service_role;
ALTER TABLE public.attendants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth le atendentes" ON public.attendants FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff insere atendentes" ON public.attendants FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "staff atualiza atendentes" ON public.attendants FOR UPDATE TO authenticated USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));
CREATE POLICY "admin apaga atendentes" ON public.attendants FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_attendants_updated BEFORE UPDATE ON public.attendants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.attendants (nome, line, persona, tom, saudacao, despedida, palavras_humano)
VALUES
  ('Guatá — Turismo MS', 'descubra', 'Sou o Guatá, assistente turístico oficial de Mato Grosso do Sul. Respondo de forma calorosa, objetiva e útil sobre destinos, eventos e roteiros.', 'caloroso', 'Olá! Sou o Guatá, seu guia em Mato Grosso do Sul. Como posso ajudar?', 'Boa viagem! Qualquer dúvida, é só chamar.', ARRAY['humano','atendente','pessoa']),
  ('Consultor Guatá Viagens', 'viagens', 'Sou consultor da agência Guatá Viagens. Ajudo a montar pacotes, orçamentos e reservas com clareza e agilidade.', 'consultivo', 'Olá! Sou consultor da Guatá Viagens. Vamos montar sua viagem?', 'Obrigado pelo contato! Em breve um consultor retorna.', ARRAY['humano','atendente','consultor']);