
-- Add break/away mode column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_on_break boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS break_started_at timestamptz;
