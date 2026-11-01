ALTER TABLE public.broadcast_campaigns ADD COLUMN IF NOT EXISTS organization_id uuid;
CREATE INDEX IF NOT EXISTS broadcast_campaigns_org_idx ON public.broadcast_campaigns(organization_id);