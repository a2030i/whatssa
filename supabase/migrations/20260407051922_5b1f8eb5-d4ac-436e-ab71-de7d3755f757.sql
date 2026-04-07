ALTER TABLE public.email_routing_rules 
ADD COLUMN IF NOT EXISTS attachment_types text[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ticket_assigned_agent_id uuid REFERENCES public.profiles(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ticket_assigned_team_id uuid REFERENCES public.teams(id) DEFAULT NULL;