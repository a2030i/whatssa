ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS rate_limit_settings jsonb DEFAULT '{
    "min_delay_seconds": 8,
    "max_delay_seconds": 15,
    "batch_size": 10,
    "batch_pause_seconds": 30,
    "daily_limit": 200,
    "hourly_limit": 50,
    "enabled": true
  }'::jsonb;

-- Update the safe view to include rate_limit_settings
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
         code_verification_status, name_status,
         rate_limit_settings
  FROM public.whatsapp_config;

ALTER VIEW public.whatsapp_config_safe SET (security_invoker = true);

-- Table to track daily/hourly send counts per channel for rate limiting
CREATE TABLE IF NOT EXISTS public.channel_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.whatsapp_config(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  message_type text DEFAULT 'campaign',
  recipient_phone text
);

CREATE INDEX IF NOT EXISTS idx_channel_send_log_channel_time ON public.channel_send_log (channel_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_send_log_org ON public.channel_send_log (org_id, sent_at DESC);

ALTER TABLE public.channel_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org send logs"
  ON public.channel_send_log FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Function to check rate limits
CREATE OR REPLACE FUNCTION public.check_channel_rate_limit(_channel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _config record;
  _settings jsonb;
  _hourly_count int;
  _daily_count int;
  _hourly_limit int;
  _daily_limit int;
BEGIN
  SELECT rate_limit_settings INTO _settings
  FROM public.whatsapp_config WHERE id = _channel_id;

  IF _settings IS NULL OR (_settings->>'enabled')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('allowed', true, 'hourly_count', 0, 'daily_count', 0);
  END IF;

  _hourly_limit := COALESCE((_settings->>'hourly_limit')::int, 50);
  _daily_limit := COALESCE((_settings->>'daily_limit')::int, 200);

  SELECT count(*) INTO _hourly_count FROM public.channel_send_log
  WHERE channel_id = _channel_id AND sent_at > now() - interval '1 hour';

  SELECT count(*) INTO _daily_count FROM public.channel_send_log
  WHERE channel_id = _channel_id AND sent_at > now() - interval '24 hours';

  IF _hourly_count >= _hourly_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'hourly_limit_reached',
      'hourly_count', _hourly_count, 'hourly_limit', _hourly_limit,
      'daily_count', _daily_count, 'daily_limit', _daily_limit);
  END IF;

  IF _daily_count >= _daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit_reached',
      'hourly_count', _hourly_count, 'hourly_limit', _hourly_limit,
      'daily_count', _daily_count, 'daily_limit', _daily_limit);
  END IF;

  RETURN jsonb_build_object('allowed', true,
    'hourly_count', _hourly_count, 'hourly_limit', _hourly_limit,
    'daily_count', _daily_count, 'daily_limit', _daily_limit);
END;
$$;