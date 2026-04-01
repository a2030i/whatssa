
-- ═══════════════════════════════════════════════
-- 1. Blacklisted Numbers
-- ═══════════════════════════════════════════════
CREATE TABLE public.blacklisted_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  reason TEXT,
  blocked_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, phone)
);
ALTER TABLE public.blacklisted_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own blacklist" ON public.blacklisted_numbers
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins manage blacklist" ON public.blacklisted_numbers
  FOR ALL TO authenticated
  USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ═══════════════════════════════════════════════
-- 2. Automation Execution Logs
-- ═══════════════════════════════════════════════
CREATE TABLE public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  rule_name TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone TEXT,
  action_type TEXT NOT NULL,
  action_result TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own automation logs" ON public.automation_logs
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins insert automation logs" ON public.automation_logs
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ═══════════════════════════════════════════════
-- 3. Bot Analytics Events
-- ═══════════════════════════════════════════════
CREATE TABLE public.bot_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  flow_id UUID NOT NULL REFERENCES public.chatbot_flows(id) ON DELETE CASCADE,
  node_id TEXT,
  event_type TEXT NOT NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bot_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own bot analytics" ON public.bot_analytics
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Insert bot analytics" ON public.bot_analytics
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- ═══════════════════════════════════════════════
-- 4. Chatbot Flow Scheduling
-- ═══════════════════════════════════════════════
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS schedule_start TIME;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS schedule_end TIME;
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS schedule_days INTEGER[] DEFAULT '{0,1,2,3,4,5,6}';

-- ═══════════════════════════════════════════════
-- 5. Webhook Dispatch Logs
-- ═══════════════════════════════════════════════
CREATE TABLE public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_id UUID REFERENCES public.org_webhooks(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER,
  response_body TEXT,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see own webhook logs" ON public.webhook_logs
  FOR SELECT TO authenticated
  USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- ═══════════════════════════════════════════════
-- 6. Welcome Messages per Channel (in whatsapp_config)
-- ═══════════════════════════════════════════════
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS welcome_message_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS welcome_message_text TEXT;
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS welcome_message_new_only BOOLEAN DEFAULT true;

-- ═══════════════════════════════════════════════
-- 7. API Rate Limiting Tracking
-- ═══════════════════════════════════════════════
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER,
  response_time_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins see own api logs" ON public.api_request_logs
  FOR SELECT TO authenticated
  USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_automation_logs_org_created ON public.automation_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_analytics_flow ON public.bot_analytics(flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blacklisted_org_phone ON public.blacklisted_numbers(org_id, phone);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_org ON public.webhook_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org ON public.api_request_logs(org_id, created_at DESC);
