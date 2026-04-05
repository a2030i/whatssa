
-- 1. Drop the overly permissive public-role policies on system_settings
DROP POLICY IF EXISTS "allow_all_system_settings_insert" ON public.system_settings;
DROP POLICY IF EXISTS "allow_all_system_settings_select" ON public.system_settings;
DROP POLICY IF EXISTS "allow_all_system_settings_update" ON public.system_settings;

-- 2. Add authenticated read-only policy for system_settings (all authenticated users can read settings)
CREATE POLICY "Authenticated users read system settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

-- 3. Add UPDATE policy on storage.objects for chat-media bucket
CREATE POLICY "Org members update own chat media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM conversations c WHERE c.org_id = get_user_org_id(auth.uid())
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT c.id::text FROM conversations c WHERE c.org_id = get_user_org_id(auth.uid())
      )
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );
