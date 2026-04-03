
-- Knowledge Base table for AI auto-reply
CREATE TABLE public.ai_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage knowledge base"
ON public.ai_knowledge_base FOR ALL TO authenticated
USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org members read knowledge base"
ON public.ai_knowledge_base FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

-- AI Reply Feedback table for team corrections
CREATE TABLE public.ai_reply_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id),
  message_id UUID REFERENCES public.messages(id),
  ai_response TEXT NOT NULL,
  corrected_response TEXT,
  feedback_type TEXT NOT NULL DEFAULT 'correction', -- correction, approved, rejected
  feedback_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.ai_reply_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage ai feedback"
ON public.ai_reply_feedback FOR ALL TO authenticated
USING (org_id = get_user_org_id(auth.uid()))
WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members read ai feedback"
ON public.ai_reply_feedback FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
