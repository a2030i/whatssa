
-- Create a cron job to fetch emails automatically every 2 minutes
SELECT cron.schedule(
  'email-fetch-imap',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/email-fetch-imap',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{"auto":true}'::jsonb
  );
  $$
);
