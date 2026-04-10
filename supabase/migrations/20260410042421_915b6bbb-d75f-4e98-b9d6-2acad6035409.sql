
-- 1. Fix api_tokens: restrict SELECT to admins only
DROP POLICY IF EXISTS "org_members_select" ON public.api_tokens;
DROP POLICY IF EXISTS "org_admins_select_tokens" ON public.api_tokens;

CREATE POLICY "org_admins_select_tokens"
ON public.api_tokens
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- 2. Fix email_configs: restrict SELECT to admins only
DROP POLICY IF EXISTS "org_members_select" ON public.email_configs;
DROP POLICY IF EXISTS "org_admins_select_email_configs" ON public.email_configs;

CREATE POLICY "org_admins_select_email_configs"
ON public.email_configs
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- 3. Fix zapier_webhooks: restrict SELECT to admins only
DROP POLICY IF EXISTS "Users manage own org zapier_webhooks" ON public.zapier_webhooks;
DROP POLICY IF EXISTS "org_admins_manage_zapier_webhooks" ON public.zapier_webhooks;

CREATE POLICY "org_admins_manage_zapier_webhooks"
ON public.zapier_webhooks
FOR ALL
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);
