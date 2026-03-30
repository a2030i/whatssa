
-- Saved replies table for org-level quick responses
CREATE TABLE public.saved_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'عام',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique shortcut per org
CREATE UNIQUE INDEX saved_replies_org_shortcut ON public.saved_replies (org_id, shortcut);

ALTER TABLE public.saved_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own replies" ON public.saved_replies
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage replies" ON public.saved_replies
  FOR ALL TO authenticated
  USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Members can also insert replies
CREATE POLICY "Members insert replies" ON public.saved_replies
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));
