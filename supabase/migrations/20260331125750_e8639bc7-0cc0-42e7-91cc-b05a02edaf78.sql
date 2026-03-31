ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS channel_label text;

DROP VIEW IF EXISTS public.whatsapp_config_safe;
CREATE VIEW public.whatsapp_config_safe AS
SELECT id, org_id, phone_number_id, business_account_id, display_phone, business_name,
       is_connected, created_at, updated_at, token_expires_at, token_refresh_error,
       token_last_refreshed_at, registration_status, registration_error, registered_at,
       last_register_attempt_at, channel_type, evolution_instance_name, evolution_instance_status,
       default_team_id, default_agent_id, channel_label
FROM public.whatsapp_config;