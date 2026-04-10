-- Update whatsapp_config_safe view to include all columns added since initial creation
-- The old view was missing: quality_rating, messaging_limit_tier, onboarding_type,
-- health_status, channel_label, last_webhook_at, settings, throughput_level, etc.
-- This caused AdminWhatsAppMonitor to show null for all Meta-specific fields.

CREATE OR REPLACE VIEW public.whatsapp_config_safe AS
SELECT
  id,
  org_id,
  phone_number_id,
  business_account_id,
  display_phone,
  business_name,
  is_connected,
  channel_type,
  channel_label,
  settings,
  -- Registration state
  registration_status,
  registration_error,
  registered_at,
  last_register_attempt_at,
  -- Token metadata (no actual token)
  token_expires_at,
  token_refresh_error,
  token_last_refreshed_at,
  -- Onboarding / migration
  onboarding_type,
  migration_source,
  migration_status,
  migration_error,
  migrated_at,
  previous_provider,
  -- Meta account details
  meta_business_id,
  quality_rating,
  messaging_limit_tier,
  account_mode,
  data_localization_region,
  throughput_level,
  health_status,
  code_verification_status,
  name_status,
  app_scoped_user_id,
  -- Routing
  default_team_id,
  default_agent_id,
  exclude_supervisors,
  rate_limit_settings,
  -- Evolution
  evolution_instance_name,
  evolution_instance_status,
  -- Activity
  last_webhook_at,
  created_at,
  updated_at
FROM public.whatsapp_config;

-- Ensure access grants remain correct
GRANT SELECT ON public.whatsapp_config_safe TO authenticated;

-- Drop the old anon webhook policy (SELECT is already revoked for anon role,
-- but drop the explicit policy for cleanliness)
DROP POLICY IF EXISTS "Anon can read config for webhook" ON public.whatsapp_config;
