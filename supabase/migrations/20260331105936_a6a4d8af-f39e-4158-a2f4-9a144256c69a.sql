
-- إصلاح ثغرة تغيير org_id في جدول profiles
-- هذا يمنع المستخدم من تغيير org_id الخاص به للوصول لبيانات مؤسسات أخرى

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND org_id = (SELECT p.org_id FROM public.profiles p WHERE p.id = auth.uid())
);
