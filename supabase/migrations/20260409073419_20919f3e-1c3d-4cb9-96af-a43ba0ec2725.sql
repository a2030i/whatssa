
-- 1. Fix health_check_logs: remove anon INSERT access
DROP POLICY IF EXISTS "Allow edge functions to insert" ON public.health_check_logs;
-- Edge functions use service_role which bypasses RLS, so no replacement INSERT policy needed.
-- Keep only the super admin SELECT policy that already exists.

-- 2. Fix white_label_partners: restrict public read to exclude sensitive fields
DROP POLICY IF EXISTS "Public read active partners" ON public.white_label_partners;

-- Create a view that excludes sensitive columns for public access
CREATE OR REPLACE VIEW public.white_label_partners_public AS
SELECT 
  id, slug, name, logo_url, favicon_url,
  primary_color, secondary_color, accent_color, 
  foreground_color, background_color,
  is_active, is_default, metadata,
  privacy_policy_url, terms_url
FROM public.white_label_partners
WHERE is_active = true;

-- Grant anon access to the public view
GRANT SELECT ON public.white_label_partners_public TO anon;
GRANT SELECT ON public.white_label_partners_public TO authenticated;
