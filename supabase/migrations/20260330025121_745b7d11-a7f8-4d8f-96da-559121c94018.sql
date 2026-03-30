
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'reply',
  ADD COLUMN IF NOT EXISTS action_tag text,
  ADD COLUMN IF NOT EXISTS action_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.automation_rules.action_type IS 'reply | add_tag | assign_team | reply_and_tag';
