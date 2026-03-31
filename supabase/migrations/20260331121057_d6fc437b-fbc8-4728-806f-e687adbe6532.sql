DROP POLICY IF EXISTS "Org members update conversations" ON public.conversations;
CREATE POLICY "Org members update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (
  (org_id = get_user_org_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  (org_id = get_user_org_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);