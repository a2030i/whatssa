ALTER TABLE public.whatsapp_config 
  ADD COLUMN IF NOT EXISTS registration_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS registration_error text,
  ADD COLUMN IF NOT EXISTS registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_register_attempt_at timestamptz;