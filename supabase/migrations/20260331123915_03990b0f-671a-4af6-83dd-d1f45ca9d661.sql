
CREATE TABLE public.template_status_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_meta_id text NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL,
  category text,
  language text,
  last_checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_id, template_meta_id)
);

ALTER TABLE public.template_status_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their template cache"
ON public.template_status_cache FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role manages template cache"
ON public.template_status_cache FOR ALL TO service_role
USING (true) WITH CHECK (true);
