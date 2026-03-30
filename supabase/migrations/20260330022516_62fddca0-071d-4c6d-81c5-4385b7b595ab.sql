
-- Make chat-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Drop existing overly permissive storage policies
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users upload chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

-- Create org-scoped SELECT policy for authenticated users
CREATE POLICY "Org members view own chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM conversations c
      WHERE c.org_id = get_user_org_id(auth.uid())
    )
  );

-- Create org-scoped INSERT policy for authenticated users
CREATE POLICY "Org members upload own chat media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] IN (
      SELECT c.id::text FROM conversations c
      WHERE c.org_id = get_user_org_id(auth.uid())
    )
  );
