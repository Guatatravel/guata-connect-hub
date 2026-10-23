-- Staff pode enviar arquivos direto ao bucket (browser → Storage), pasta = auth.uid()
drop policy if exists "staff upload knowledge bucket" on storage.objects;
drop policy if exists "staff update knowledge bucket" on storage.objects;
drop policy if exists "staff delete knowledge bucket" on storage.objects;

create policy "staff upload knowledge bucket"
  on storage.objects for insert
  with check (
    bucket_id = 'knowledge'
    and public.is_staff (auth.uid ())
    and (storage.foldername (name))[1] = auth.uid ()::text
  );

create policy "staff update knowledge bucket"
  on storage.objects for update
  using (
    bucket_id = 'knowledge'
    and public.is_staff (auth.uid ())
    and (storage.foldername (name))[1] = auth.uid ()::text
  )
  with check (
    bucket_id = 'knowledge'
    and public.is_staff (auth.uid ())
    and (storage.foldername (name))[1] = auth.uid ()::text
  );

create policy "staff delete knowledge bucket"
  on storage.objects for delete
  using (
    bucket_id = 'knowledge'
    and public.is_staff (auth.uid ())
    and (storage.foldername (name))[1] = auth.uid ()::text
  );
