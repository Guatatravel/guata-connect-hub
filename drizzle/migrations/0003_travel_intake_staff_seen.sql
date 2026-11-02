ALTER TABLE public.travel_intake ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz;
UPDATE public.travel_intake SET staff_seen_at = now() WHERE staff_seen_at IS NULL;