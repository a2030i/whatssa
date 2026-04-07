
CREATE TABLE public.sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  first_response_minutes INT NOT NULL DEFAULT 30,
  resolution_minutes INT NOT NULL DEFAULT 480,
  escalation_enabled BOOLEAN DEFAULT true,
  escalation_team_id UUID REFERENCES public.teams(id),
  is_active BOOLEAN DEFAULT true,
  apply_to_channels TEXT[] DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org sla policies"
  ON public.sla_policies FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage sla policies"
  ON public.sla_policies FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

CREATE INDEX idx_sla_policies_org ON public.sla_policies(org_id);
