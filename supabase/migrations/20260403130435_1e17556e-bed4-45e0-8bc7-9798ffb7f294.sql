
DROP POLICY IF EXISTS "Org members upload own chat media" ON storage.objects;
CREATE POLICY "Org members upload own chat media" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM conversations c
      WHERE c.org_id = get_user_org_id(auth.uid())
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Org members view own chat media" ON storage.objects;
CREATE POLICY "Org members view own chat media" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM conversations c
      WHERE c.org_id = get_user_org_id(auth.uid())
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Org members delete own chat media" ON storage.objects;
CREATE POLICY "Org members delete own chat media" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM conversations c
      WHERE c.org_id = get_user_org_id(auth.uid())
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);
