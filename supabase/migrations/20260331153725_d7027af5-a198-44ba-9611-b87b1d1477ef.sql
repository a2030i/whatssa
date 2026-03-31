-- Revoke SELECT on the raw token column from authenticated and anon roles
-- This prevents the plain-text token from being readable via RLS policies
REVOKE SELECT (token) ON public.api_tokens FROM authenticated;
REVOKE SELECT (token) ON public.api_tokens FROM anon;

-- Grant SELECT only on safe columns
GRANT SELECT (id, name, token_hash, token_preview, permissions, is_active, last_used_at, created_at, expires_at, created_by, org_id) ON public.api_tokens TO authenticated;