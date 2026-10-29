-- Frases prontas da agência. O funil (guia, etiqueta, quadro, follow-up) fica em sessions.intake_data.
create table if not exists public.quick_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists quick_replies_org_idx on public.quick_replies (organization_id, created_at desc);

alter table public.quick_replies enable row level security;
grant select, insert, update, delete on public.quick_replies to authenticated;
grant all on public.quick_replies to service_role;
