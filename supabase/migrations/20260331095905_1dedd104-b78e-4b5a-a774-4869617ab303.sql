
-- Create a safe view that excludes access_token and webhook_verify_token
CREATE OR REPLACE VIEW public.whatsapp_config_safe AS
SELECT
  id, org_id, phone_number_id, business_account_id,
  display_phone, business_name, is_connected,
  created_at, updated_at, token_expires_at,
  token_refresh_error, token_last_refreshed_at,
  registration_status, registration_error, registered_at,
  last_register_attempt_at, channel_type,
  evolution_instance_name, evolution_instance_status,
  default_team_id, default_agent_id
FROM public.whatsapp_config;

-- Enable RLS-like access on the view by granting select to authenticated
GRANT SELECT ON public.whatsapp_config_safe TO authenticated;

-- Revoke direct SELECT on whatsapp_config from authenticated users
-- so they must use the safe view. Service role (edge functions) still has full access.
REVOKE SELECT ON public.whatsapp_config FROM authenticated;
