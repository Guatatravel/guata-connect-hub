-- Telefones de campanha e o conteúdo bruto do webhook não saem pelo navegador.
-- O painel lê isso só pelo service role.

DROP POLICY IF EXISTS "staff read broadcast_recipients" ON public.broadcast_recipients;
DROP POLICY IF EXISTS "staff write broadcast_recipients" ON public.broadcast_recipients;
DROP POLICY IF EXISTS "member read broadcast_recipients" ON public.broadcast_recipients;
DROP POLICY IF EXISTS "member write broadcast_recipients" ON public.broadcast_recipients;

CREATE POLICY "member read broadcast_recipients" ON public.broadcast_recipients
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.broadcast_campaigns c
    JOIN public.organization_members om ON om.organization_id = c.organization_id
    WHERE c.id = campaign_id
      AND om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "staff le entregas whatsapp" ON public.whatsapp_deliveries;
REVOKE ALL ON TABLE public.whatsapp_deliveries FROM anon, authenticated;

DROP POLICY IF EXISTS "staff le mensagens processadas" ON public.whatsapp_processed_messages;
REVOKE ALL ON TABLE public.whatsapp_processed_messages FROM anon, authenticated;
