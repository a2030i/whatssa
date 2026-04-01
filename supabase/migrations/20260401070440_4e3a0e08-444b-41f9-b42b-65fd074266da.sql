
-- Add migration/metadata columns to whatsapp_config
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS onboarding_type text DEFAULT 'new' CHECK (onboarding_type IN ('new', 'existing', 'migrated')),
  ADD COLUMN IF NOT EXISTS migration_source text,
  ADD COLUMN IF NOT EXISTS migration_status text DEFAULT 'none' CHECK (migration_status IN ('none', 'pending', 'in_progress', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS migration_error text,
  ADD COLUMN IF NOT EXISTS migrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_provider text,
  ADD COLUMN IF NOT EXISTS meta_business_id text,
  ADD COLUMN IF NOT EXISTS quality_rating text,
  ADD COLUMN IF NOT EXISTS messaging_limit_tier text,
  ADD COLUMN IF NOT EXISTS account_mode text,
  ADD COLUMN IF NOT EXISTS data_localization_region text,
  ADD COLUMN IF NOT EXISTS throughput_level text,
  ADD COLUMN IF NOT EXISTS health_status jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS code_verification_status text,
  ADD COLUMN IF NOT EXISTS name_status text,
  ADD COLUMN IF NOT EXISTS app_scoped_user_id text;

-- Update view to include new columns
DROP VIEW IF EXISTS public.whatsapp_config_safe;
CREATE VIEW public.whatsapp_config_safe AS
  SELECT id, org_id, phone_number_id, business_account_id, display_phone, business_name,
         is_connected, registration_status, registration_error, registered_at, last_register_attempt_at,
         channel_type, evolution_instance_name, evolution_instance_status,
         default_team_id, default_agent_id, channel_label, settings,
         created_at, updated_at, token_expires_at,
         onboarding_type, migration_source, migration_status, migration_error, migrated_at, previous_provider,
         meta_business_id, quality_rating, messaging_limit_tier, account_mode,
         data_localization_region, throughput_level, health_status,
         code_verification_status, name_status
  FROM public.whatsapp_config;
