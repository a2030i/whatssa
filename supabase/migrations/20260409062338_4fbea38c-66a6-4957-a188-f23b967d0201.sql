-- Drop the restrictive read policy and add one for super admins to see all
DROP POLICY IF EXISTS "Authenticated users read active modules" ON public.plan_modules;

-- Super admins see everything (active + inactive)
CREATE POLICY "Super admins read all plan_modules"
  ON public.plan_modules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));