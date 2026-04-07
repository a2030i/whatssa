
CREATE TABLE IF NOT EXISTS public.email_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_config_id uuid REFERENCES public.email_configs(id) ON DELETE CASCADE,
  rule_type text NOT NULL DEFAULT 'domain',
  pattern text NOT NULL,
  assigned_agent_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_routing_org ON public.email_routing_rules(org_id);
CREATE INDEX idx_email_routing_config ON public.email_routing_rules(email_config_id);

ALTER TABLE public.email_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage email routing rules"
  ON public.email_routing_rules FOR ALL TO authenticated
  USING ((org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)))
  WITH CHECK ((org_id = get_user_org_id(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)));

CREATE POLICY "Org members view email routing rules"
  ON public.email_routing_rules FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
