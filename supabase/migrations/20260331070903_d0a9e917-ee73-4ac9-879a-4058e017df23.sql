
ALTER TABLE public.plans 
  ADD COLUMN IF NOT EXISTS max_unofficial_phones integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stores integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_teams integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_campaigns_per_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 7;
