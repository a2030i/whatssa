
-- 1. Add missing index on scheduled_messages for cron polling (884 seq_scans!)
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending 
ON public.scheduled_messages (status, scheduled_at) 
WHERE status = 'pending';

-- 2. Add index on whatsapp_config for channel_type queries (332 seq_scans)
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_channel_type 
ON public.whatsapp_config (channel_type, is_connected);

-- 3. Add index on system_logs for cleanup operations (881 rows growing)
CREATE INDEX IF NOT EXISTS idx_system_logs_cleanup 
ON public.system_logs (created_at);

-- 4. Add index on health_check_logs for time-based queries
CREATE INDEX IF NOT EXISTS idx_health_check_created 
ON public.health_check_logs (created_at);

-- 5. Clean up old system_logs (keep last 30 days only)
DELETE FROM public.system_logs WHERE created_at < now() - interval '30 days';

-- 6. Clean up old health_check_logs (keep last 7 days)
DELETE FROM public.health_check_logs WHERE created_at < now() - interval '7 days';
