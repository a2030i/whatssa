CREATE OR REPLACE FUNCTION public.get_org_whatsapp_channels()
RETURNS TABLE (
  id uuid,
  org_id uuid,
  phone_number_id text,
  business_account_id text,
  display_phone text,
  business_name text,
  is_connected boolean,
  registration_status text,
  registration_error text,
  registered_at timestamptz,
  channel_type text,
  evolution_instance_name text,
  evolution_instance_status text,
  default_team_id uuid,
  default_agent_id uuid,
  channel_label text,
  settings jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  token_expires_at timestamptz,
  onboarding_type text,
  migration_source text,
  migration_status text,
  migration_error text,
  migrated_at timestamptz,
  previous_provider text,
  meta_business_id text,
  quality_rating text,
  messaging_limit_tier text,
  account_mode text,
  data_localization_region text,
  throughput_level text,
  health_status jsonb,
  code_verification_status text,
  name_status text,
  rate_limit_settings jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wc.id,
    wc.org_id,
    wc.phone_number_id,
    wc.business_account_id,
    wc.display_phone,
    wc.business_name,
    wc.is_connected,
    wc.registration_status,
    wc.registration_error,
    wc.registered_at,
    wc.channel_type,
    wc.evolution_instance_name,
    wc.evolution_instance_status,
    wc.default_team_id,
    wc.default_agent_id,
    wc.channel_label,
    wc.settings,
    wc.created_at,
    wc.updated_at,
    wc.token_expires_at,
    wc.onboarding_type,
    wc.migration_source,
    wc.migration_status,
    wc.migration_error,
    wc.migrated_at,
    wc.previous_provider,
    wc.meta_business_id,
    wc.quality_rating,
    wc.messaging_limit_tier,
    wc.account_mode,
    wc.data_localization_region,
    wc.throughput_level,
    wc.health_status,
    wc.code_verification_status,
    wc.name_status,
    wc.rate_limit_settings
  FROM public.whatsapp_config wc
  WHERE wc.org_id = public.get_user_org_id(auth.uid())
     OR public.has_role(auth.uid(), 'super_admin');
$$;

REVOKE ALL ON FUNCTION public.get_org_whatsapp_channels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_whatsapp_channels() TO authenticated;