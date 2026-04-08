
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_ids text[] DEFAULT '{}';

-- Migrate existing team_id data to team_ids
UPDATE public.profiles SET team_ids = ARRAY[team_id] WHERE team_id IS NOT NULL AND (team_ids IS NULL OR team_ids = '{}');
