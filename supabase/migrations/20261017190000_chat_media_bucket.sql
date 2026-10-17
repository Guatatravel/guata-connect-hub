-- Mídia de conversas (imagens, áudios) para o painel
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do nothing;

drop policy if exists "staff read chat-media" on storage.objects;
drop policy if exists "service role chat-media" on storage.objects;

create policy "staff read chat-media"
  on storage.objects for select
  using (
    bucket_id = 'chat-media'
    and public.is_staff (auth.uid ())
  );

-- Upload/delete via service role no servidor (webhook + replyAsAgent)
