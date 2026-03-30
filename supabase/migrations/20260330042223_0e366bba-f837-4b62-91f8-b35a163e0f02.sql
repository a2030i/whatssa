ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS default_team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_agent_id uuid;