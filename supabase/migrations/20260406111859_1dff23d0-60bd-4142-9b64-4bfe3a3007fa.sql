ALTER TABLE public.email_configs 
  ADD COLUMN label text,
  ADD COLUMN dedicated_agent_id uuid REFERENCES public.profiles(id),
  ADD COLUMN dedicated_team_id uuid REFERENCES public.teams(id);