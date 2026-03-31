
-- Table to store AI provider configurations per organization
CREATE TABLE public.ai_provider_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'openai',
  api_key TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '{"chat_reply": true, "conversation_summary": false, "smart_analysis": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_provider CHECK (provider IN ('openai', 'gemini', 'openrouter'))
);

-- Enable RLS
ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

-- Only admins of the org can manage their AI configs
CREATE POLICY "Admins manage own ai configs"
  ON public.ai_provider_configs
  FOR ALL
  TO authenticated
  USING (
    ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Members can see if AI is configured (but not the key)
CREATE POLICY "Org members see ai config existence"
  ON public.ai_provider_configs
  FOR SELECT
  TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
