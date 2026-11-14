-- Número, conta e token do WhatsApp só para dono/administrador.
-- O painel grava pelo service role; o navegador não lê essas colunas.

CREATE OR REPLACE FUNCTION public.user_can_manage_org_whatsapp(_uid uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.organization_members om ON om.user_id = ur.user_id
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE ur.user_id = _uid
      AND ur.role = 'admin'::public.app_role
      AND o.is_guata = true
  )
  OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = _uid
        AND om.organization_id = _org_id
        AND om.role IN ('owner', 'admin')
    );
$$;

REVOKE ALL ON FUNCTION public.user_can_manage_org_whatsapp(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_manage_org_whatsapp(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON TABLE public.whatsapp_channels FROM anon, authenticated;
GRANT SELECT (
  id,
  organization_id,
  line,
  label,
  is_active,
  created_at,
  updated_at
) ON TABLE public.whatsapp_channels TO authenticated;

DROP POLICY IF EXISTS "member le channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "member gerencia channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "staff le channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "admin gerencia channels" ON public.whatsapp_channels;
DROP POLICY IF EXISTS "admin le channels" ON public.whatsapp_channels;

CREATE POLICY "admin le channels" ON public.whatsapp_channels
FOR SELECT TO authenticated
USING (public.user_can_manage_org_whatsapp(auth.uid(), organization_id));
