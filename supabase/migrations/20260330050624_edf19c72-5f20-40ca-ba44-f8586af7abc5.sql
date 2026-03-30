
-- Enable required extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to check usage limits (used by webhooks before creating conversations)
CREATE OR REPLACE FUNCTION public.check_org_limit(_org_id uuid, _check_type text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan record;
  _usage record;
  _period text;
  _result jsonb;
BEGIN
  _period := to_char(now(), 'YYYY-MM');
  
  SELECT p.max_conversations, p.max_messages_per_month
  INTO _plan
  FROM organizations o
  JOIN plans p ON p.id = o.plan_id
  WHERE o.id = _org_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true);
  END IF;
  
  SELECT COALESCE(conversations_count, 0) AS conv,
         COALESCE(messages_sent + messages_received, 0) AS msgs
  INTO _usage
  FROM usage_tracking
  WHERE org_id = _org_id AND period = _period;
  
  IF NOT FOUND THEN
    _usage := ROW(0, 0);
  END IF;
  
  IF _check_type = 'conversation' AND _plan.max_conversations < 999999 AND _usage.conv >= _plan.max_conversations THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'conversation_limit_reached', 'used', _usage.conv, 'max', _plan.max_conversations);
  END IF;
  
  IF _check_type = 'message' AND _plan.max_messages_per_month < 999999 AND _usage.msgs >= _plan.max_messages_per_month THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'message_limit_reached', 'used', _usage.msgs, 'max', _plan.max_messages_per_month);
  END IF;
  
  RETURN jsonb_build_object('allowed', true);
END;
$$;
