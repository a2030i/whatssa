ALTER TABLE public.wa_flows 
ADD COLUMN IF NOT EXISTS forward_to_phone text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS forward_to_group_jid text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS forward_channel_id uuid DEFAULT NULL;