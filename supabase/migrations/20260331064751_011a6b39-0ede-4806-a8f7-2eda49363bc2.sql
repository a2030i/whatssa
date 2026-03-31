CREATE TABLE public.custom_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'inbox',
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  is_shared boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.custom_inboxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own custom inboxes"
ON public.custom_inboxes FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org members manage custom inboxes"
ON public.custom_inboxes FOR ALL TO authenticated
USING (org_id = get_user_org_id(auth.uid()))
WITH CHECK (org_id = get_user_org_id(auth.uid()));