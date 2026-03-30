
-- 1. Fix payments: restrict UPDATE to admins only
DROP POLICY IF EXISTS "Service updates payments" ON public.payments;
CREATE POLICY "Admins update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
