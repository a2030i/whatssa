ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS assigned_to_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES public.teams(id);