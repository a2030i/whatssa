CREATE OR REPLACE FUNCTION public.hash_api_token(_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _token text;
  _org_id uuid;
  _caller_org uuid;
BEGIN
  -- Get token details
  SELECT token, org_id INTO _token, _org_id
  FROM public.api_tokens WHERE id = _token_id;

  IF _token IS NULL THEN
    RAISE EXCEPTION 'Token not found';
  END IF;

  -- Verify caller owns this org (or is super admin)
  _caller_org := get_user_org_id(auth.uid());
  IF _caller_org != _org_id AND NOT has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Hash token, set preview, clear plain text
  UPDATE public.api_tokens
  SET token_hash = encode(digest(_token, 'sha256'), 'hex'),
      token_preview = substr(_token, 1, 8) || '••••' || substr(_token, length(_token) - 3, 4),
      token = 'REDACTED'
  WHERE id = _token_id;
END;
$$;