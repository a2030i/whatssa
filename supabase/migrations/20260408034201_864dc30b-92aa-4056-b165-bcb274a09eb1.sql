
-- Table to track Lovable AI usage per organization
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  model TEXT,
  tokens_used INTEGER DEFAULT 0,
  triggered_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ai_usage_logs_org_id ON public.ai_usage_logs(org_id);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read all, org admins can read their own
CREATE POLICY "Super admins can read all ai_usage_logs"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Org admins can read own ai_usage_logs"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));
