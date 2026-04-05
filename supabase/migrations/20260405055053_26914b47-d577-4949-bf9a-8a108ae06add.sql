ALTER TABLE public.conversations ADD COLUMN dedicated_agent_id uuid REFERENCES public.profiles(id) DEFAULT NULL;
ALTER TABLE public.conversations ADD COLUMN dedicated_agent_name text DEFAULT NULL;
CREATE INDEX idx_conversations_dedicated_agent ON public.conversations(dedicated_agent_id) WHERE dedicated_agent_id IS NOT NULL;