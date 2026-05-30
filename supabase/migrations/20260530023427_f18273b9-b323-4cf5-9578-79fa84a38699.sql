-- Habilita pg_cron e pg_net (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Limpeza diária: sessões sem mensagens há mais de 60 dias e seus dados associados
SELECT cron.schedule(
  'guata-cleanup-sessions',
  '15 3 * * *',
  $$
  DELETE FROM public.messages
   WHERE session_id IN (
     SELECT id FROM public.sessions
      WHERE last_message_at < now() - INTERVAL '60 days'
   );
  DELETE FROM public.sessions
   WHERE last_message_at < now() - INTERVAL '60 days'
     AND id NOT IN (SELECT session_id FROM public.travel_intake);
  $$
);