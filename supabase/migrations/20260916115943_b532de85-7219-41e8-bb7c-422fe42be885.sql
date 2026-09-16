CREATE TABLE public.whatsapp_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signature_ok boolean NOT NULL DEFAULT false,
  signature_header text,
  phone_number_id text,
  line text,
  event_kind text NOT NULL DEFAULT 'unknown',
  message_ids text[] NOT NULL DEFAULT '{}'::text[],
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_deliveries TO authenticated;
GRANT ALL ON public.whatsapp_deliveries TO service_role;

ALTER TABLE public.whatsapp_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff le entregas whatsapp"
ON public.whatsapp_deliveries FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));

CREATE INDEX idx_whatsapp_deliveries_created_at ON public.whatsapp_deliveries (created_at DESC);

CREATE TABLE public.whatsapp_processed_messages (
  message_id text NOT NULL PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_processed_messages TO authenticated;
GRANT ALL ON public.whatsapp_processed_messages TO service_role;

ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff le mensagens processadas"
ON public.whatsapp_processed_messages FOR SELECT TO authenticated
USING (public.is_staff(auth.uid()));