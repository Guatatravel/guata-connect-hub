
-- Helper: usuário tem QUALQUER papel (consultor ou admin)
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Fix search_path em funções auxiliares
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.generate_protocol() SET search_path = public;

-- Reescrever policies abertas para exigir staff
DROP POLICY "auth atualiza sessions" ON public.sessions;
DROP POLICY "auth insere sessions" ON public.sessions;
CREATE POLICY "staff atualiza sessions" ON public.sessions FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff insere sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY "auth insere messages" ON public.messages;
CREATE POLICY "staff insere messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY "auth atualiza triagens" ON public.travel_intake;
DROP POLICY "auth insere triagens" ON public.travel_intake;
CREATE POLICY "staff atualiza triagens" ON public.travel_intake FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff insere triagens" ON public.travel_intake FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY "auth atualiza posts" ON public.channel_posts;
DROP POLICY "auth insere posts" ON public.channel_posts;
CREATE POLICY "staff atualiza posts" ON public.channel_posts FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff insere posts" ON public.channel_posts FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
