ALTER TABLE public.passhub_settings
  ADD COLUMN IF NOT EXISTS api_key_aereo text,
  ADD COLUMN IF NOT EXISTS api_key_hotel text,
  ADD COLUMN IF NOT EXISTS api_key_seguro text,
  ADD COLUMN IF NOT EXISTS api_key_rodoviario text,
  ADD COLUMN IF NOT EXISTS agency_contact_email text,
  ADD COLUMN IF NOT EXISTS agency_contact_phone text;

UPDATE public.passhub_settings
SET api_key_aereo = COALESCE(api_key_aereo, api_key),
    api_key_hotel = COALESCE(api_key_hotel, api_key),
    api_key_seguro = COALESCE(api_key_seguro, api_key),
    api_key_rodoviario = COALESCE(api_key_rodoviario, api_key)
WHERE api_key IS NOT NULL;

COMMENT ON COLUMN public.passhub_settings.api_key IS 'DEPRECATED: replaced by per-product keys api_key_aereo/hotel/seguro/rodoviario';
COMMENT ON COLUMN public.passhub_settings.agency_contact_email IS 'Agency e-mail used in bookings/emissions instead of the traveller e-mail';
COMMENT ON COLUMN public.passhub_settings.agency_contact_phone IS 'Agency phone used in bookings/emissions instead of the traveller phone';