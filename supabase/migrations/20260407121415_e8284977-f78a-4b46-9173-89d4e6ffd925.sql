
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS safety_max_per_hour integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS safety_max_per_day integer DEFAULT 500,
  ADD COLUMN IF NOT EXISTS safety_max_unique_per_hour integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS safety_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS safety_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS safety_paused_reason text,
  ADD COLUMN IF NOT EXISTS channel_age_days integer DEFAULT 0;
