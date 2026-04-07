
-- Extend email_routing_rules with keyword conditions and ticket creation actions
ALTER TABLE public.email_routing_rules
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'assign',
  ADD COLUMN IF NOT EXISTS ticket_category text DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS ticket_priority text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS ticket_title_template text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS include_attachments boolean DEFAULT true;

-- Add service_role policy for ticket creation from edge functions
CREATE POLICY "service_role_tickets_all" ON public.tickets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
