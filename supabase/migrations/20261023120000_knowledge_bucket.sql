-- Arquivos da base de conhecimento (PDFs, imagens promocionais)
insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

drop policy if exists "staff read knowledge bucket" on storage.objects;

create policy "staff read knowledge bucket"
  on storage.objects for select
  using (
    bucket_id = 'knowledge'
    and public.is_staff (auth.uid ())
  );

-- Upload/delete via service role no servidor (addKnowledgeFile, webhook)
