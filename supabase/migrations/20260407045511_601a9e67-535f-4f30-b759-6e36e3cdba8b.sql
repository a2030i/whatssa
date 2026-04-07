
-- Create a function that invokes retry-messages when a channel reconnects
CREATE OR REPLACE FUNCTION public.trigger_retry_on_reconnect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pending_count int;
  supabase_url text;
  service_key text;
BEGIN
  -- Check if there are pending messages for this org
  SELECT count(*) INTO pending_count
  FROM public.message_retry_queue
  WHERE org_id = NEW.org_id
    AND status = 'pending';

  IF pending_count > 0 THEN
    -- Use pg_net to call retry-messages edge function
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/retry-messages',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on whatsapp_config when is_connected changes to true
DROP TRIGGER IF EXISTS trg_retry_on_whatsapp_reconnect ON public.whatsapp_config;
CREATE TRIGGER trg_retry_on_whatsapp_reconnect
  AFTER UPDATE OF is_connected ON public.whatsapp_config
  FOR EACH ROW
  WHEN (OLD.is_connected = false AND NEW.is_connected = true)
  EXECUTE FUNCTION public.trigger_retry_on_reconnect();

-- Trigger on email_configs when is_active changes to true
DROP TRIGGER IF EXISTS trg_retry_on_email_activate ON public.email_configs;
CREATE TRIGGER trg_retry_on_email_activate
  AFTER UPDATE OF is_active ON public.email_configs
  FOR EACH ROW
  WHEN (OLD.is_active = false AND NEW.is_active = true)
  EXECUTE FUNCTION public.trigger_retry_on_reconnect();
