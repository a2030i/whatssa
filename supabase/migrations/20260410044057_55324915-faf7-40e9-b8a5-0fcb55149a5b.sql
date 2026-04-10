
-- 1. Email open tracking table
CREATE TABLE IF NOT EXISTS public.email_open_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  tracking_token text NOT NULL UNIQUE,
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_open_tracking_token ON public.email_open_tracking(tracking_token);
CREATE INDEX idx_email_open_tracking_message ON public.email_open_tracking(message_id);
CREATE INDEX idx_email_open_tracking_conv ON public.email_open_tracking(conversation_id);

ALTER TABLE public.email_open_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_open_tracking"
ON public.email_open_tracking FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "service_role_all_open_tracking"
ON public.email_open_tracking FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 2. Per-employee email signature
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_signature text;

-- 3. Email templates library
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_select_email_templates"
ON public.email_templates FOR SELECT TO authenticated
USING (
  is_system = true
  OR org_id = public.get_user_org_id(auth.uid())
);

CREATE POLICY "org_admins_manage_email_templates"
ON public.email_templates FOR ALL TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- 4. Insert system email templates
INSERT INTO public.email_templates (name, category, subject, body_html, is_system) VALUES
('ترحيب بعميل جديد', 'welcome', 'مرحباً بك!', '<h2>مرحباً بك 👋</h2><p>نحن سعداء بانضمامك إلينا. فريقنا جاهز لمساعدتك في أي وقت.</p><p>لا تتردد في التواصل معنا إذا كان لديك أي استفسار.</p><br><p>مع أطيب التحيات</p>', true),
('متابعة عميل', 'followup', 'متابعة: طلبك', '<h2>متابعة</h2><p>نود الاطمئنان على تجربتك معنا والتأكد من رضاك عن الخدمة.</p><p>هل هناك أي شيء يمكننا مساعدتك فيه؟</p><br><p>مع أطيب التحيات</p>', true),
('إغلاق تذكرة', 'ticket', 'تم إغلاق التذكرة', '<h2>تم إغلاق التذكرة ✅</h2><p>نود إعلامك بأنه تم إغلاق التذكرة الخاصة بطلبك.</p><p>في حال واجهتك أي مشكلة أخرى، لا تتردد في فتح تذكرة جديدة.</p><br><p>شكراً لتواصلك معنا</p>', true),
('عرض سعر', 'quote', 'عرض سعر', '<h2>عرض سعر 📋</h2><p>نشكرك على اهتمامك. يرجى الاطلاع على تفاصيل العرض أدناه:</p><br><table style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6"><th style="border:1px solid #ddd;padding:8px;text-align:right">الوصف</th><th style="border:1px solid #ddd;padding:8px;text-align:right">الكمية</th><th style="border:1px solid #ddd;padding:8px;text-align:right">السعر</th></tr><tr><td style="border:1px solid #ddd;padding:8px">المنتج / الخدمة</td><td style="border:1px solid #ddd;padding:8px">1</td><td style="border:1px solid #ddd;padding:8px">0.00 ر.س</td></tr></table><br><p>العرض صالح لمدة 14 يوم</p><p>مع أطيب التحيات</p>', true),
('شكر بعد الشراء', 'thankyou', 'شكراً لطلبك!', '<h2>شكراً لطلبك! 🎉</h2><p>تم استلام طلبك بنجاح وسيتم معالجته في أقرب وقت.</p><p>سنقوم بإبلاغك فور شحن الطلب.</p><br><p>مع أطيب التحيات</p>', true),
('تذكير بموعد', 'reminder', 'تذكير بموعدك', '<h2>تذكير بموعد 📅</h2><p>نود تذكيرك بموعدك القادم:</p><p><strong>التاريخ:</strong> [التاريخ]</p><p><strong>الوقت:</strong> [الوقت]</p><p>نرجو الحضور في الموعد المحدد. في حال رغبتك بإلغاء أو تغيير الموعد، يرجى إبلاغنا مسبقاً.</p><br><p>مع أطيب التحيات</p>', true);
