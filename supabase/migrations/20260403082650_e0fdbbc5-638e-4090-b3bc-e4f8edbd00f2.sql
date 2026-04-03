-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Org members insert conversations" ON public.conversations;

-- Recreate with super_admin bypass
CREATE POLICY "Org members insert conversations" ON public.conversations
FOR INSERT TO authenticated
WITH CHECK (
  (org_id = get_user_org_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
