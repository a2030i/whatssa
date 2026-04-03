
CREATE TABLE public.follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  assigned_to uuid,
  customer_phone text NOT NULL,
  customer_name text,
  scheduled_at timestamptz NOT NULL,
  reminder_note text,
  auto_send_message text,
  auto_send_template_name text,
  auto_send_template_language text DEFAULT 'ar',
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage follow-ups"
  ON public.follow_up_reminders FOR ALL
  TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE INDEX idx_follow_ups_org_status ON public.follow_up_reminders (org_id, status, scheduled_at);
CREATE INDEX idx_follow_ups_conv ON public.follow_up_reminders (conversation_id);
CREATE INDEX idx_follow_ups_pending ON public.follow_up_reminders (status, scheduled_at) WHERE status = 'pending';

ALTER PUBLICATION supabase_realtime ADD TABLE public.follow_up_reminders;
