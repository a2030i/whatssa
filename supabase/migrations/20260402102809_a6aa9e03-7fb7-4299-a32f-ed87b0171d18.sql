CREATE OR REPLACE FUNCTION public.admin_get_infra_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _table_sizes jsonb;
  _storage_size bigint;
  _auth_users int;
  _active_connections int;
  _db_size numeric;
  _total_tables int;
  _total_indexes int;
  _uptime numeric;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'row_count', t.row_estimate,
    'size_mb', t.size_mb
  ) ORDER BY t.size_mb DESC)
  FROM (
    SELECT 
      relname AS table_name,
      reltuples::bigint AS row_estimate,
      round((pg_total_relation_size(c.oid) / 1048576.0)::numeric, 2) AS size_mb
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 15
  ) t INTO _table_sizes;

  SELECT COALESCE(sum((metadata->>'size')::bigint), 0)
  INTO _storage_size
  FROM storage.objects
  WHERE metadata->>'size' IS NOT NULL;

  SELECT count(*) INTO _auth_users FROM auth.users;
  SELECT count(*) INTO _active_connections FROM pg_stat_activity WHERE state = 'active';
  SELECT round((pg_database_size(current_database()) / 1048576.0)::numeric, 1) INTO _db_size;
  SELECT count(*) INTO _total_tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r';
  SELECT count(*) INTO _total_indexes FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'i';
  SELECT round(extract(epoch FROM (now() - pg_postmaster_start_time())) / 3600.0) INTO _uptime;

  _result := jsonb_build_object(
    'db_size_mb', _db_size,
    'db_max_mb', 8192,
    'storage_size_mb', round((_storage_size / 1048576.0)::numeric, 2),
    'storage_max_mb', 102400,
    'auth_users', _auth_users,
    'auth_max_users', 50000,
    'active_connections', _active_connections,
    'max_connections', 200,
    'table_sizes', COALESCE(_table_sizes, '[]'::jsonb),
    'total_tables', _total_tables,
    'total_indexes', _total_indexes,
    'uptime_hours', _uptime
  );

  RETURN _result;
END;
$function$;