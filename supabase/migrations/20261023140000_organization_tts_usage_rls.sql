-- Uso de TTS é atualizado só pelo servidor (service role). Cliente não acessa direto.
ALTER TABLE public.organization_tts_usage ENABLE ROW LEVEL SECURITY;

-- Sem políticas para authenticated/anon: nega leitura e escrita via chave pública.
-- service_role continua com acesso total (bypass RLS).
