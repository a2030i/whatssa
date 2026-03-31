
-- Drop existing overly-broad policies on whatsapp_config
DROP POLICY IF EXISTS "Admins manage config" ON public.whatsapp_config;
DROP POLICY IF EXISTS "Admins see own config" ON public.whatsapp_config;

-- Create specific policies for UPDATE and DELETE only (no SELECT - use whatsapp_config_safe view)
CREATE POLICY "Admins update own config"
ON public.whatsapp_config FOR UPDATE
TO authenticated
USING (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins delete own config"
ON public.whatsapp_config FOR DELETE
TO authenticated
USING (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins insert own config"
ON public.whatsapp_config FOR INSERT
TO authenticated
WITH CHECK (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Revoke direct SELECT on whatsapp_config from authenticated role
-- Edge functions use service_role which bypasses RLS, so they still have full access
REVOKE SELECT ON public.whatsapp_config FROM authenticated;
REVOKE SELECT ON public.whatsapp_config FROM anon;
