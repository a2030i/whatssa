
-- Tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone TEXT,
  customer_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT NOT NULL DEFAULT 'general',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message_ids TEXT[] DEFAULT '{}',
  message_previews JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast org lookup
CREATE INDEX idx_tickets_org_id ON public.tickets(org_id);
CREATE INDEX idx_tickets_conversation_id ON public.tickets(conversation_id);
CREATE INDEX idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX idx_tickets_status ON public.tickets(status);

-- Enable RLS
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- RLS: users can see tickets in their org
CREATE POLICY "tickets_select_own_org" ON public.tickets
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- RLS: users can insert tickets in their org
CREATE POLICY "tickets_insert_own_org" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- RLS: users can update tickets in their org
CREATE POLICY "tickets_update_own_org" ON public.tickets
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- RLS: admins can delete tickets in their org
CREATE POLICY "tickets_delete_admin" ON public.tickets
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- Updated_at trigger
CREATE TRIGGER set_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update task_type options: add new types to tasks table
-- (task_type is a text column, no enum change needed, just documenting new values)
