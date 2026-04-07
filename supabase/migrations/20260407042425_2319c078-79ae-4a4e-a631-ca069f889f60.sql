
CREATE TABLE IF NOT EXISTS public.email_message_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  email_subject text,
  email_from text,
  email_from_name text,
  email_to text,
  email_cc text,
  email_bcc text,
  email_message_id text,
  email_in_reply_to text,
  email_references text,
  email_attachments jsonb DEFAULT '[]'::jsonb,
  sent_by uuid,
  sent_by_name text,
  direction text NOT NULL DEFAULT 'inbound',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_details_message_id ON public.email_message_details(message_id);
CREATE INDEX IF NOT EXISTS idx_email_details_conversation_id ON public.email_message_details(conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_details_org_id ON public.email_message_details(org_id);
CREATE INDEX IF NOT EXISTS idx_email_details_email_message_id ON public.email_message_details(email_message_id);

ALTER TABLE public.email_message_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own email details"
  ON public.email_message_details FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org members insert email details"
  ON public.email_message_details FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Service role full access email details"
  ON public.email_message_details FOR ALL TO service_role
  USING (true) WITH CHECK (true);
