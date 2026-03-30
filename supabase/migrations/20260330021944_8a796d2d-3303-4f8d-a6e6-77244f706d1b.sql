
-- 1. Fix api_tokens: restrict SELECT to admins only (drop the permissive org-wide SELECT)
DROP POLICY IF EXISTS "Org members see own tokens" ON public.api_tokens;
CREATE POLICY "Admins see own tokens" ON public.api_tokens
  FOR SELECT TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 2. Fix whatsapp_config: restrict SELECT to admins only
DROP POLICY IF EXISTS "Org members see own config" ON public.whatsapp_config;
CREATE POLICY "Admins see own config" ON public.whatsapp_config
  FOR SELECT TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Also restrict the ALL policy on whatsapp_config to admins
DROP POLICY IF EXISTS "Org members manage config" ON public.whatsapp_config;
CREATE POLICY "Admins manage config" ON public.whatsapp_config
  FOR ALL TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- 3. Fix system_logs: remove anon INSERT policy (edge functions use service role key)
DROP POLICY IF EXISTS "Anon and service insert logs" ON public.system_logs;

-- Also fix the authenticated INSERT policy to not use WITH CHECK (true) - scope to org
DROP POLICY IF EXISTS "System inserts logs" ON public.system_logs;
CREATE POLICY "Authenticated inserts logs" ON public.system_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 4. Fix activity_logs: tighten the INSERT policy
DROP POLICY IF EXISTS "System inserts logs" ON public.activity_logs;
CREATE POLICY "Authenticated inserts logs" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());
