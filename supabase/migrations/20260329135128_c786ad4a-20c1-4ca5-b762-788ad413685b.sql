
ALTER TABLE public.whatsapp_config
ADD COLUMN IF NOT EXISTS token_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS token_refresh_error text,
ADD COLUMN IF NOT EXISTS token_last_refreshed_at timestamp with time zone;
