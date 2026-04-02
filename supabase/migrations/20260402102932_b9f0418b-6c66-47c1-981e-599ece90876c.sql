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
BEGIN
  SELECT jsonb_build_object(
    'messages_today', (SELECT count(*) FROM messages WHERE created_at >= _today),
    'messages_this_hour', (SELECT count(*) FROM messages WHERE created_at >= _hour_start),
    'messages_yesterday', (SELECT count(*) FROM messages WHERE created_at >= (_today - interval '1 day') AND created_at < _today),
    'messages_total', (SELECT count(*) FROM messages),
    'conversations_today', (SELECT count(*) FROM conversations WHERE created_at >= _today),
    'conversations_total', (SELECT count(*) FROM conversations),
    'conversations_active', (SELECT count(*) FROM conversations WHERE status = 'active'),
    'campaigns_today', (SELECT count(*) FROM campaigns WHERE created_at >= _today),
    'campaigns_running', (SELECT count(*) FROM campaigns WHERE status = 'sending'),
    'orgs_total', (SELECT count(*) FROM organizations),
    'orgs_active', (SELECT count(*) FROM organizations WHERE is_active = true AND subscription_status = 'active'),
    'orgs_trial', (SELECT count(*) FROM organizations WHERE subscription_status = 'trial'),
    'users_total', (SELECT count(*) FROM profiles),
    'users_online', (SELECT count(*) FROM profiles WHERE is_online = true OR last_seen_at > now() - interval '5 minutes'),
    'db_size_mb', (SELECT round((pg_database_size(current_database()) / 1048576.0)::numeric, 1)),
    'messages_table_rows', (SELECT reltuples::bigint FROM pg_class WHERE relname = 'messages'),
    'avg_messages_per_hour_today', (
      SELECT CASE 
        WHEN extract(hour from now()) = 0 THEN 0
        ELSE round((SELECT count(*) FROM messages WHERE created_at >= _today)::numeric / GREATEST(extract(hour from now()), 1), 0)
      END
    )
  ) INTO _result;
  
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_hourly_messages(_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'hour', h,
      'count', COALESCE(c, 0)
    ) ORDER BY h
  )
  FROM generate_series(0, 23) AS h
  LEFT JOIN (
    SELECT extract(hour from created_at)::int AS hr, count(*) AS c
    FROM messages
    WHERE created_at >= _date AND created_at < _date + interval '1 day'
    GROUP BY hr
  ) m ON m.hr = h
  INTO _result;
  
  RETURN COALESCE(_result, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_top_orgs_usage(_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _period text := to_char(now(), 'YYYY-MM');
BEGIN
  SELECT jsonb_agg(row_to_json(t)) FROM (
    SELECT 
      o.name AS org_name,
      o.subscription_status,
      p.name_ar AS plan_name,
      COALESCE(u.messages_sent, 0) + COALESCE(u.messages_received, 0) AS total_messages,
      COALESCE(u.conversations_count, 0) AS conversations,
      p.max_messages_per_month,
      p.max_conversations,
      CASE WHEN p.max_messages_per_month > 0 
        THEN round(((COALESCE(u.messages_sent, 0) + COALESCE(u.messages_received, 0))::numeric / p.max_messages_per_month) * 100, 1)
        ELSE 0 
      END AS usage_pct
    FROM organizations o
    LEFT JOIN plans p ON p.id = o.plan_id
    LEFT JOIN usage_tracking u ON u.org_id = o.id AND u.period = _period
    ORDER BY (COALESCE(u.messages_sent, 0) + COALESCE(u.messages_received, 0)) DESC
    LIMIT _limit
  ) t INTO _result;
  
  RETURN COALESCE(_result, '[]'::jsonb);
END;
$function$;