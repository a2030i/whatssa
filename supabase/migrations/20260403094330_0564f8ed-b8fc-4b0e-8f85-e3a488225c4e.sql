
-- Tasks table for internal task management
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone TEXT,
  customer_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_type TEXT NOT NULL DEFAULT 'agent',
  source_data JSONB DEFAULT '{}'::jsonb,
  forward_target TEXT,
  forward_status TEXT DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast org queries
CREATE INDEX idx_tasks_org_status ON public.tasks(org_id, status);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to, status);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view tasks in their org"
  ON public.tasks FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can create tasks in their org"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update tasks in their org"
  ON public.tasks FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can delete tasks in their org"
  ON public.tasks FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Forward config table for shipping company details
CREATE TABLE public.forward_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  forward_type TEXT NOT NULL DEFAULT 'whatsapp_group',
  target_phone TEXT,
  target_email TEXT,
  target_group_jid TEXT,
  channel_id UUID REFERENCES public.whatsapp_config(id) ON DELETE SET NULL,
  message_template TEXT DEFAULT '📦 طلب رقم: {{order_number}}\n👤 العميل: {{customer_name}}\n📝 الملاحظة: {{note}}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forward_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage forward configs in their org"
  ON public.forward_configs FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- Updated at trigger
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_forward_configs_updated_at BEFORE UPDATE ON public.forward_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
