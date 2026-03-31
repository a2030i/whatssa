
-- إعادة صلاحية SELECT للمصادقين حتى تعمل عمليات UPDATE و DELETE
GRANT SELECT ON public.whatsapp_config TO authenticated;

-- إضافة سياسة SELECT مقيّدة للأدمن فقط (مطلوبة لتقييم USING في UPDATE/DELETE)
CREATE POLICY "Admins read own config"
ON public.whatsapp_config FOR SELECT
TO authenticated
USING (
  ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
