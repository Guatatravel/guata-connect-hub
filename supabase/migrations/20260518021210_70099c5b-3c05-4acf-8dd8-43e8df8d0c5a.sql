
-- has_role é chamada pelas próprias RLS policies, autenticados precisam executar
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
