
CREATE OR REPLACE FUNCTION public.admin_get_infra_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _table_sizes jsonb;
  _storage_size bigint;
  _auth_users int;
  _edge_functions int;
  _active_connections int;
BEGIN
  -- Table sizes
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

  -- Storage buckets size
  SELECT COALESCE(sum(metadata->>'size')::bigint, 0)
  INTO _storage_size
  FROM storage.objects;

  -- Auth users count
  SELECT count(*) INTO _auth_users FROM auth.users;

  -- Active DB connections
  SELECT count(*) INTO _active_connections 
  FROM pg_stat_activity 
  WHERE state = 'active';

  SELECT jsonb_build_object(
    'db_size_mb', (SELECT round((pg_database_size(current_database()) / 1048576.0)::numeric, 1)),
    'db_max_mb', 500,
    'storage_size_mb', round((_storage_size / 1048576.0)::numeric, 2),
    'storage_max_mb', 1024,
    'auth_users', _auth_users,
    'auth_max_users', 50000,
    'active_connections', _active_connections,
    'max_connections', 60,
    'table_sizes', COALESCE(_table_sizes, '[]'::jsonb),
    'total_tables', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'),
    'total_indexes', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'i'),
    'uptime_hours', (SELECT round(extract(epoch FROM (now() - pg_postmaster_start_time())) / 3600.0)::numeric, 1)
  ) INTO _result;

  RETURN _result;
END;
$$;
