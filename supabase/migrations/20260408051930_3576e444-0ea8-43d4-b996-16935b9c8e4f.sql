
-- Add channel linking to knowledge base
ALTER TABLE public.ai_knowledge_base
  ADD COLUMN IF NOT EXISTS channel_ids uuid[] DEFAULT NULL;

-- Add AI settings to WhatsApp config
ALTER TABLE public.whatsapp_config
  ADD COLUMN IF NOT EXISTS ai_auto_reply_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_max_attempts int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS ai_transfer_keywords text[] DEFAULT ARRAY['موظف', 'بشري', 'agent', 'human'],
  ADD COLUMN IF NOT EXISTS ai_welcome_message text DEFAULT NULL;
