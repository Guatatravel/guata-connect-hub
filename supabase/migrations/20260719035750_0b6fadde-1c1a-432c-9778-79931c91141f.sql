ALTER PUBLICATION supabase_realtime ADD TABLE public.travel_intake;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER TABLE public.travel_intake REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;