
DROP POLICY IF EXISTS "auth lê sessions" ON public.sessions;
CREATE POLICY "staff lê sessions" ON public.sessions FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth le atendentes" ON public.attendants;
CREATE POLICY "staff le atendentes" ON public.attendants FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth lê settings" ON public.channel_settings;
CREATE POLICY "staff lê settings" ON public.channel_settings FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth lê posts" ON public.channel_posts;
CREATE POLICY "staff lê posts" ON public.channel_posts FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth lê triagens" ON public.travel_intake;
CREATE POLICY "staff lê triagens" ON public.travel_intake FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth lê serviços" ON public.agency_services;
CREATE POLICY "staff lê serviços" ON public.agency_services FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "auth lê messages" ON public.messages;
CREATE POLICY "staff lê messages" ON public.messages FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
