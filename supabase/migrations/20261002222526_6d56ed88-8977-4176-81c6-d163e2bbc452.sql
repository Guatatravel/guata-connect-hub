CREATE TABLE public.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  empresa text NOT NULL CHECK (char_length(empresa) BETWEEN 2 AND 160),
  email text NOT NULL CHECK (char_length(email) BETWEEN 5 AND 255),
  whatsapp text NOT NULL CHECK (char_length(whatsapp) BETWEEN 8 AND 30),
  cidade text CHECK (char_length(cidade) <= 120),
  mensagem text CHECK (char_length(mensagem) <= 1000),
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','aguardando_pagamento','liberado','recusado')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.access_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_requests TO authenticated;
GRANT ALL ON public.access_requests TO service_role;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qualquer um solicita acesso" ON public.access_requests FOR INSERT TO anon, authenticated WITH CHECK (status = 'novo' AND notas IS NULL);
CREATE POLICY "admin le solicitacoes" ON public.access_requests FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin atualiza solicitacoes" ON public.access_requests FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "admin apaga solicitacoes" ON public.access_requests FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));