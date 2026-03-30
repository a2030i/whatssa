
-- Create satisfaction_ratings table
CREATE TABLE public.satisfaction_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  agent_name TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.satisfaction_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own ratings" ON public.satisfaction_ratings
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role inserts ratings" ON public.satisfaction_ratings
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Add satisfaction_status to conversations (null = not sent, pending = sent awaiting reply, rated = received)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS satisfaction_status TEXT DEFAULT NULL;
