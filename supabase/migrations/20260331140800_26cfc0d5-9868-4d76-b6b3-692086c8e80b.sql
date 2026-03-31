
-- Add channel_ids array to chatbot_flows
ALTER TABLE public.chatbot_flows ADD COLUMN IF NOT EXISTS channel_ids uuid[] DEFAULT '{}';

-- Add channel_ids array to automation_rules
ALTER TABLE public.automation_rules ADD COLUMN IF NOT EXISTS channel_ids uuid[] DEFAULT '{}';

COMMENT ON COLUMN public.chatbot_flows.channel_ids IS 'Optional: restrict this flow to specific WhatsApp channels. Empty = all channels.';
COMMENT ON COLUMN public.automation_rules.channel_ids IS 'Optional: restrict this rule to specific WhatsApp channels. Empty = all channels.';
