-- Disparos WhatsApp (campanhas), módulo Conhecimento
create table if not exists public.broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  line public.channel_line not null default 'descubra',
  body text not null default '',
  image_path text,
  audience text not null default 'active_7d',
  status text not null default 'rascunho',
  created_by uuid references auth.users (id) on delete set null,
  sent_ok integer not null default 0,
  sent_fail integer not null default 0,
  sent_skip integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.broadcast_campaigns (id) on delete cascade,
  phone text not null,
  session_id uuid references public.sessions (id) on delete set null,
  status text not null default 'pendente',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists broadcast_recipients_campaign_id_idx
  on public.broadcast_recipients (campaign_id);

alter table public.broadcast_campaigns enable row level security;
alter table public.broadcast_recipients enable row level security;

drop policy if exists "staff read broadcast_campaigns" on public.broadcast_campaigns;
drop policy if exists "staff write broadcast_campaigns" on public.broadcast_campaigns;
drop policy if exists "staff read broadcast_recipients" on public.broadcast_recipients;
drop policy if exists "staff write broadcast_recipients" on public.broadcast_recipients;

create policy "staff read broadcast_campaigns"
  on public.broadcast_campaigns for select
  using (public.is_staff (auth.uid ()));

create policy "staff write broadcast_campaigns"
  on public.broadcast_campaigns for all
  using (public.is_staff (auth.uid ()))
  with check (public.is_staff (auth.uid ()));

create policy "staff read broadcast_recipients"
  on public.broadcast_recipients for select
  using (public.is_staff (auth.uid ()));

create policy "staff write broadcast_recipients"
  on public.broadcast_recipients for all
  using (public.is_staff (auth.uid ()))
  with check (public.is_staff (auth.uid ()));

insert into storage.buckets (id, name, public)
values ('campaigns', 'campaigns', true)
on conflict (id) do update set public = true;

drop policy if exists "staff upload campaigns bucket" on storage.objects;
drop policy if exists "public read campaigns bucket" on storage.objects;
drop policy if exists "staff delete campaigns bucket" on storage.objects;

create policy "staff upload campaigns bucket"
  on storage.objects for insert
  with check (
    bucket_id = 'campaigns'
    and public.is_staff (auth.uid ())
  );

create policy "public read campaigns bucket"
  on storage.objects for select
  using (bucket_id = 'campaigns');

create policy "staff delete campaigns bucket"
  on storage.objects for delete
  using (
    bucket_id = 'campaigns'
    and public.is_staff (auth.uid ())
  );
