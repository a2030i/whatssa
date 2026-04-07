
CREATE OR REPLACE FUNCTION public.trigger_retry_on_reconnect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_count int;
BEGIN
  SELECT count(*) INTO pending_count
  FROM public.message_retry_queue
  WHERE org_id = NEW.org_id
    AND status = 'pending';

  IF pending_count > 0 THEN
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
