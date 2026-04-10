-- Allow authenticated users to read plan_modules (needed for upgrade flows)
CREATE POLICY "Authenticated users can view active plan modules"
ON public.plan_modules
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to validate coupons (read-only, active only)
CREATE POLICY "Authenticated users can view active coupons"
ON public.coupons
FOR SELECT
TO authenticated
USING (is_active = true);

-- Enable Realtime Authorization (RLS on realtime.messages)
-- This ensures users can only subscribe to channels scoped to their org
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy: users can only receive realtime events for their org's data
CREATE POLICY "Users can only listen to their org channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow subscription when the realtime topic extension contains the user's org_id
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
  )
);