-- Modo template nos disparos e índice para recibo de leitura.
alter table public.broadcast_campaigns
  add column if not exists send_mode text not null default 'sessao',
  add column if not exists template_name text,
  add column if not exists template_language text not null default 'pt_BR',
  add column if not exists template_uses_name boolean not null default true,
  add column if not exists extra_phones text;

create index if not exists messages_wa_message_id_idx
  on public.messages ((metadata->>'wa_message_id'));
