CREATE TABLE public.instagram_oauth_attempts (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting','processing','ready','error')),
 accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.instagram_oauth_attempts FROM anon, authenticated;
GRANT ALL ON public.instagram_oauth_attempts TO service_role;
ALTER TABLE public.instagram_oauth_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY instagram_oauth_service_only ON public.instagram_oauth_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);