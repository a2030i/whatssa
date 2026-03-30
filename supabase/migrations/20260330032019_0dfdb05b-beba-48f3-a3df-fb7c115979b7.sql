
-- Chatbot Flows table
CREATE TABLE public.chatbot_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  trigger_type TEXT NOT NULL DEFAULT 'keyword',
  trigger_keywords TEXT[] DEFAULT '{}',
  welcome_message TEXT,
  nodes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.chatbot_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own chatbot flows" ON public.chatbot_flows
  FOR ALL TO authenticated
  USING (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org members view own chatbot flows" ON public.chatbot_flows
  FOR SELECT TO authenticated
  USING ((org_id = get_user_org_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Chatbot Sessions table (tracks user position in flow)
CREATE TABLE public.chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  current_node_id TEXT,
  is_active BOOLEAN DEFAULT true,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id)
);

ALTER TABLE public.chatbot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage chatbot sessions" ON public.chatbot_sessions
  FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members see own chatbot sessions" ON public.chatbot_sessions
  FOR SELECT TO authenticated
  USING ((org_id = get_user_org_id(auth.uid())) OR has_role(auth.uid(), 'super_admin'::app_role));
