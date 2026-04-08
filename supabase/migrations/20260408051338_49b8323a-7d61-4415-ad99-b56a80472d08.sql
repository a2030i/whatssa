
CREATE TABLE public.ai_pending_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone text,
  customer_question text NOT NULL,
  suggested_questions jsonb NOT NULL DEFAULT '[]',
  admin_answer text,
  status text NOT NULL DEFAULT 'pending',
  knowledge_entry_id uuid REFERENCES public.ai_knowledge_base(id) ON DELETE SET NULL,
  answered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_pending_questions_org_status ON public.ai_pending_questions(org_id, status);

ALTER TABLE public.ai_pending_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own org questions"
  ON public.ai_pending_questions FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));
