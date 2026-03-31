-- Remove broad read access on sensitive tables and replace it with safe column-level access
REVOKE SELECT ON public.whatsapp_config FROM authenticated, anon;
GRANT SELECT (
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
) ON public.whatsapp_config TO authenticated;

REVOKE SELECT ON public.api_tokens FROM authenticated, anon;
GRANT SELECT (
  id,
  name,
  token_hash,
  token_preview,
  permissions,
  is_active,
  last_used_at,
  created_at,
  expires_at,
  created_by,
  org_id
) ON public.api_tokens TO authenticated;

-- Complete remediation for existing API tokens
UPDATE public.api_tokens
SET token_hash = COALESCE(token_hash, encode(digest(token, 'sha256'), 'hex')),
    token_preview = COALESCE(token_preview, substr(token, 1, 8) || '••••' || substr(token, greatest(length(token) - 3, 1), 4)),
    token = 'REDACTED'
WHERE token <> 'REDACTED' OR token_hash IS NULL OR token_preview IS NULL;

-- Secure token creation: generate raw token, store only hash + preview, return raw token once
CREATE OR REPLACE FUNCTION public.create_api_token_secure(
  _org_id uuid,
  _name text,
  _permissions text[],
  _created_by uuid,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE(id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller_org uuid;
  _raw_token text;
  _token_id uuid;
BEGIN
  _caller_org := public.get_user_org_id(auth.uid());

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF (_caller_org IS DISTINCT FROM _org_id OR _created_by IS DISTINCT FROM auth.uid())
     AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _raw_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.api_tokens (
    org_id,
    name,
    permissions,
    created_by,
    expires_at,
    token,
    token_hash,
    token_preview
  ) VALUES (
    _org_id,
    COALESCE(NULLIF(trim(_name), ''), 'Default'),
    COALESCE(_permissions, ARRAY['messages','customers','orders','conversations']),
    _created_by,
    _expires_at,
    'REDACTED',
    encode(digest(_raw_token, 'sha256'), 'hex'),
    substr(_raw_token, 1, 8) || '••••' || substr(_raw_token, length(_raw_token) - 3, 4)
  )
  RETURNING api_tokens.id INTO _token_id;

  RETURN QUERY SELECT _token_id, _raw_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_api_token_secure(uuid, text, text[], uuid, timestamptz) TO authenticated;

-- Remove unsafe realtime publication for tenant data tables
ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations;
ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;