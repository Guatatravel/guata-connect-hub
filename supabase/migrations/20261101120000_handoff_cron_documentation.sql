-- Retomada de handoff: agende HTTP POST no app (defina CRON_SECRET no servidor).
-- Exemplo manual (substitua URL e secret no Supabase SQL ou use cron externo):
-- GET/POST https://SEU-DOMINIO/api/public/cron/resume-handoffs
-- Header: Authorization: Bearer SEU_CRON_SECRET
--
-- Para pg_cron + pg_net (opcional, após configurar URL pública):
-- SELECT cron.schedule(
--   'guata-resume-handoffs',
--   '*/5 * * * *',
--   $$ SELECT net.http_get(
--        url := 'https://SEU-DOMINIO/api/public/cron/resume-handoffs?secret=SEU_CRON_SECRET'
--      ); $$
-- );

SELECT 1;
