CREATE TABLE public.automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
  reply_text TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_rules_org_enabled ON public.automation_rules (org_id, enabled);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own automation rules"
ON public.automation_rules
FOR ALL
TO authenticated
USING (
  ((org_id = public.get_user_org_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  ((org_id = public.get_user_org_id(auth.uid())) AND public.has_role(auth.uid(), 'admin'::app_role))
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Org members view own automation rules"
ON public.automation_rules
FOR SELECT
TO authenticated
USING (
  (org_id = public.get_user_org_id(auth.uid()))
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE TRIGGER update_automation_rules_updated_at
BEFORE UPDATE ON public.automation_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();