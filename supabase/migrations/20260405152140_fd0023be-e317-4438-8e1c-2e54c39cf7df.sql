-- Allow org admins to manage roles for users in their org
CREATE POLICY "Admins manage org member roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND user_id IN (
    SELECT id FROM public.profiles WHERE org_id = get_user_org_id(auth.uid())
  )
  AND role != 'super_admin'
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND user_id IN (
    SELECT id FROM public.profiles WHERE org_id = get_user_org_id(auth.uid())
  )
  AND role != 'super_admin'
);