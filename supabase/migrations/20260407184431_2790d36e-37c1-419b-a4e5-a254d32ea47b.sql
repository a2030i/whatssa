
-- Add domain verification columns to white_label_partners
ALTER TABLE public.white_label_partners 
  ADD COLUMN IF NOT EXISTS domain_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS domain_verify_token text,
  ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_last_check_at timestamptz;

-- domain_status values: not_configured, pending, verified, failed
