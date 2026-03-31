
-- Revoke full SELECT and grant column-level SELECT excluding sensitive columns
REVOKE SELECT ON public.whatsapp_config FROM authenticated;

GRANT SELECT (
  id, phone_number_id, business_account_id, display_phone, business_name,
  is_connected, created_at, updated_at, org_id, token_expires_at,
  token_refresh_error, token_last_refreshed_at, registration_status,
  registration_error, registered_at, last_register_attempt_at,
  channel_type, evolution_instance_name, evolution_instance_status,
  default_team_id, default_agent_id
) ON public.whatsapp_config TO authenticated;
