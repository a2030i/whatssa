
-- 1. Fix store_integrations: restrict SELECT to admins only (protects webhook_secret)
DROP POLICY IF EXISTS "Org members see store integrations" ON store_integrations;
CREATE POLICY "Admins see store integrations"
ON store_integrations FOR SELECT TO authenticated
USING (
  (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- 2. Remove organizations from Realtime publication (sensitive subscription/plan data)
ALTER PUBLICATION supabase_realtime DROP TABLE public.organizations;

-- 3. Remove profiles from Realtime publication (reduces exposure)
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
