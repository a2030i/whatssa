
-- =============================================
-- PERFORMANCE FIX: Add missing critical indexes
-- =============================================

-- conversations: org_id is used in almost every query via RLS
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON public.conversations (org_id);

-- conversations: composite for dashboard/inbox filtering
CREATE INDEX IF NOT EXISTS idx_conversations_org_status_last_msg ON public.conversations (org_id, status, last_message_at DESC);

-- conversations: assigned_team for SLA escalation queries
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_team ON public.conversations (org_id, assigned_team, status) WHERE assigned_to IS NOT NULL;

-- whatsapp_config: org_id + channel_type used in every send/webhook
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_org_type ON public.whatsapp_config (org_id, channel_type, is_connected);

-- profiles: org_id used heavily via RLS and team queries
CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles (org_id);

-- teams: org_id
CREATE INDEX IF NOT EXISTS idx_teams_org_id ON public.teams (org_id);

-- notifications: user_id for per-user notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id, is_read, created_at DESC);

-- messages: composite for conversation message loading
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC);

-- messages: wa_message_id for status webhook lookups
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON public.messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- store_integrations: org_id
CREATE INDEX IF NOT EXISTS idx_store_integrations_org ON public.store_integrations (org_id);

-- system_logs: composite for cleanup and querying
CREATE INDEX IF NOT EXISTS idx_system_logs_org_created ON public.system_logs (org_id, created_at DESC);

-- wallets: org_id (unique already exists but verify)
CREATE INDEX IF NOT EXISTS idx_wallets_org ON public.wallets (org_id);

-- plans: is_active for plan lookups
CREATE INDEX IF NOT EXISTS idx_plans_active ON public.plans (is_active);

-- orders: org_id + status composite
CREATE INDEX IF NOT EXISTS idx_orders_org_status ON public.orders (org_id, status);

-- chatbot_sessions: conversation lookup
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_conv_active ON public.chatbot_sessions (conversation_id, is_active) WHERE is_active = true;

-- automation_rules: org lookup
CREATE INDEX IF NOT EXISTS idx_automation_rules_org ON public.automation_rules (org_id);
