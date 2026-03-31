
-- Fix 1: Recreate whatsapp_config_safe view with correct column order and security_invoker
DROP VIEW IF EXISTS public.whatsapp_config_safe;
CREATE VIEW public.whatsapp_config_safe 
WITH (security_invoker = on) AS
SELECT id, org_id, phone_number_id, business_account_id, display_phone, business_name,
       is_connected, created_at, updated_at, token_expires_at, token_refresh_error,
       token_last_refreshed_at, registration_status, registration_error,
       registered_at, last_register_attempt_at, channel_type, 
       evolution_instance_name, evolution_instance_status,
       default_team_id, default_agent_id
FROM public.whatsapp_config;

GRANT SELECT ON public.whatsapp_config_safe TO authenticated;

-- Fix 2: Tighten activity_logs INSERT policy
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname FROM pg_policies 
    WHERE tablename = 'activity_logs' AND schemaname = 'public' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.activity_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users insert own org activity"
ON public.activity_logs FOR INSERT TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (org_id IS NULL OR org_id = get_user_org_id(auth.uid()))
);
