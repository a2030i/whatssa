
-- Recreate whatsapp_config_safe view with security_invoker = true
-- This makes the view respect the caller's RLS context on the underlying whatsapp_config table
CREATE OR REPLACE VIEW public.whatsapp_config_safe
WITH (security_invoker = on)
AS
SELECT id,
    org_id,
    phone_number_id,
    business_account_id,
    display_phone,
    business_name,
    is_connected,
    created_at,
    updated_at,
    token_expires_at,
    token_refresh_error,
    token_last_refreshed_at,
    registration_status,
    registration_error,
    registered_at,
    last_register_attempt_at,
    channel_type,
    evolution_instance_name,
    evolution_instance_status,
    default_team_id,
    default_agent_id
FROM whatsapp_config;
