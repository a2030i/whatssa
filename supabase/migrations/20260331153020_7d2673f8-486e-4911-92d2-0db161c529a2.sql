-- Fix 1: Convert whatsapp_config_safe to SECURITY INVOKER
-- Drop and recreate the view as SECURITY INVOKER so RLS is enforced for the calling user
DROP VIEW IF EXISTS public.whatsapp_config_safe;

CREATE VIEW public.whatsapp_config_safe
WITH (security_invoker = on)
AS SELECT
  id,
  org_id,
  phone_number_id,
  business_account_id,
  display_phone,
  business_name,
  is_connected,
  created_at,
  updated_at,
  token_expires_at,
  token_last_refreshed_at,
  token_refresh_error,
  registration_status,
  registration_error,
  registered_at,
  last_register_attempt_at,
  channel_type,
  evolution_instance_name,
  evolution_instance_status,
  channel_label,
  default_team_id,
  default_agent_id,
  settings
FROM whatsapp_config;

-- Fix 2: Add token_hash column and token_preview for secure token storage
ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE public.api_tokens ADD COLUMN IF NOT EXISTS token_preview text;

-- Hash all existing tokens and create previews
UPDATE public.api_tokens
SET token_hash = encode(digest(token, 'sha256'), 'hex'),
    token_preview = substr(token, 1, 8) || '••••' || substr(token, length(token) - 3, 4)
WHERE token_hash IS NULL;