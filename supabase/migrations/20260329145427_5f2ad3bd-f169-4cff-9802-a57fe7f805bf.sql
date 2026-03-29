
-- Add assignment strategy settings to teams table
ALTER TABLE public.teams 
  ADD COLUMN IF NOT EXISTS assignment_strategy text NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS max_conversations_per_agent integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_assigned_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skill_keywords jsonb DEFAULT '[]'::jsonb;

-- Add a default assignment strategy to organizations for teams without specific config
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_assignment_strategy text NOT NULL DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS default_max_conversations integer DEFAULT NULL;

COMMENT ON COLUMN public.teams.assignment_strategy IS 'manual | round_robin | least_busy | skill_based';
COMMENT ON COLUMN public.teams.max_conversations_per_agent IS 'Max open conversations per agent, NULL = unlimited';
COMMENT ON COLUMN public.teams.last_assigned_index IS 'Tracks round-robin position';
COMMENT ON COLUMN public.teams.skill_keywords IS 'Keywords that route conversations to this team';
