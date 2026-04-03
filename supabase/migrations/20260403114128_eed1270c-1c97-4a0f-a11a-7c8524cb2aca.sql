
-- ============================================
-- 1. MISSING INDEXES for performance
-- ============================================

-- campaign_recipients: filter by status during campaign sending
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status 
ON public.campaign_recipients (campaign_id, status);

-- follow_up_reminders: cron job queries pending reminders by time
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_pending 
ON public.follow_up_reminders (status, scheduled_at) 
WHERE status = 'pending';

-- channel_send_log: rate limit checks per channel per hour
CREATE INDEX IF NOT EXISTS idx_channel_send_log_rate 
ON public.channel_send_log (channel_id, sent_at DESC);

-- automation_logs: filter by org + date for log viewing
CREATE INDEX IF NOT EXISTS idx_automation_logs_org_created 
ON public.automation_logs (org_id, created_at DESC);

-- activity_logs: filter by org + date
CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created 
ON public.activity_logs (org_id, created_at DESC);

-- api_request_logs: filter by org + date  
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org_created 
ON public.api_request_logs (org_id, created_at DESC);

-- bot_analytics: filter by org + flow
CREATE INDEX IF NOT EXISTS idx_bot_analytics_org_flow 
ON public.bot_analytics (org_id, flow_id, created_at DESC);

-- internal_notes: lookup by conversation
CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation 
ON public.internal_notes (conversation_id, created_at DESC);

-- follow_up_reminders: lookup by conversation
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_conversation 
ON public.follow_up_reminders (conversation_id);

-- chatbot_sessions: active session lookup
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_active 
ON public.chatbot_sessions (conversation_id) 
WHERE is_active = true;

-- ============================================
-- 2. REMOVE REDUNDANT RLS POLICIES
-- (ALL policy already covers SELECT with same conditions)
-- ============================================

DROP POLICY IF EXISTS "Admins see ai configs" ON public.ai_provider_configs;
DROP POLICY IF EXISTS "Admins see own tokens" ON public.api_tokens;

-- ============================================
-- 3. OPTIMIZE admin_get_system_stats()
-- Combine multiple message queries into one scan
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_get_system_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _today date := current_date;
  _hour_start timestamptz := date_trunc('hour', now());
  _yesterday date := current_date - interval '1 day';
  _msg_today bigint;
  _msg_hour bigint;
  _msg_yesterday bigint;
BEGIN
  -- Single scan on messages for all time-based counts
  SELECT
    count(*) FILTER (WHERE created_at >= _today),
    count(*) FILTER (WHERE created_at >= _hour_start),
    count(*) FILTER (WHERE created_at >= _yesterday AND created_at < _today)
  INTO _msg_today, _msg_hour, _msg_yesterday
  FROM messages
  WHERE created_at >= _yesterday;

  SELECT jsonb_build_object(
    'messages_today', _msg_today,
    'messages_this_hour', _msg_hour,
    'messages_yesterday', _msg_yesterday,
    'messages_total', (SELECT reltuples::bigint FROM pg_class WHERE relname = 'messages'),
    'conversations_today', (SELECT count(*) FROM conversations WHERE created_at >= _today),
    'conversations_total', (SELECT reltuples::bigint FROM pg_class WHERE relname = 'conversations'),
    'conversations_active', (SELECT count(*) FROM conversations WHERE status = 'active'),
    'campaigns_today', (SELECT count(*) FROM campaigns WHERE created_at >= _today),
    'campaigns_running', (SELECT count(*) FROM campaigns WHERE status = 'sending'),
    'orgs_total', (SELECT count(*) FROM organizations),
    'orgs_active', (SELECT count(*) FROM organizations WHERE is_active = true AND subscription_status = 'active'),
    'orgs_trial', (SELECT count(*) FROM organizations WHERE subscription_status = 'trial'),
    'users_total', (SELECT reltuples::bigint FROM pg_class WHERE relname = 'profiles'),
    'users_online', (SELECT count(*) FROM profiles WHERE is_online = true OR last_seen_at > now() - interval '5 minutes'),
    'db_size_mb', (SELECT round((pg_database_size(current_database()) / 1048576.0)::numeric, 1)),
    'messages_table_rows', (SELECT reltuples::bigint FROM pg_class WHERE relname = 'messages'),
    'avg_messages_per_hour_today', (
      CASE 
        WHEN extract(hour from now()) = 0 THEN 0
        ELSE round(_msg_today::numeric / GREATEST(extract(hour from now()), 1), 0)
      END
    )
  ) INTO _result;
  
  RETURN _result;
END;
$function$;

-- ============================================
-- 4. CLEANUP FUNCTION for old logs (>90 days)
-- Call via cron: SELECT public.cleanup_old_logs();
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_old_logs(_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cutoff timestamptz := now() - (_days || ' days')::interval;
  _del_activity int;
  _del_automation int;
  _del_api int;
  _del_bot int;
BEGIN
  DELETE FROM public.activity_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _del_activity = ROW_COUNT;

  DELETE FROM public.automation_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _del_automation = ROW_COUNT;

  DELETE FROM public.api_request_logs WHERE created_at < _cutoff;
  GET DIAGNOSTICS _del_api = ROW_COUNT;

  DELETE FROM public.bot_analytics WHERE created_at < _cutoff;
  GET DIAGNOSTICS _del_bot = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', _cutoff,
    'deleted_activity_logs', _del_activity,
    'deleted_automation_logs', _del_automation,
    'deleted_api_request_logs', _del_api,
    'deleted_bot_analytics', _del_bot
  );
END;
$function$;
