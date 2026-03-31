
-- 1. Drop "Admins update payments" policy to prevent admin manipulation of payment status
-- Payment updates should only happen via edge functions using service_role key
DROP POLICY IF EXISTS "Admins update payments" ON payments;

-- 2. Fix chat-media DELETE policy to use conversation/org ownership instead of user ID
DROP POLICY IF EXISTS "Users can delete own chat media" ON storage.objects;
CREATE POLICY "Org members delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] IN (
    SELECT c.id::text FROM conversations c WHERE c.org_id = get_user_org_id(auth.uid())
  )
);

-- 3. Fix system_logs INSERT policy from always-true to require authenticated user org match
DROP POLICY IF EXISTS "Authenticated inserts logs" ON system_logs;
CREATE POLICY "Authenticated inserts own org logs"
ON system_logs FOR INSERT TO authenticated
WITH CHECK (
  org_id IS NULL OR org_id = get_user_org_id(auth.uid())
);
