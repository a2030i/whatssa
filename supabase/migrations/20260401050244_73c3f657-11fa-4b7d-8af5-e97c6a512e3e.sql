DROP POLICY IF EXISTS "Org members see ai config existence" ON public.ai_provider_configs;

CREATE POLICY "Admins see ai configs"
ON public.ai_provider_configs FOR SELECT
TO authenticated
USING (
  ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);