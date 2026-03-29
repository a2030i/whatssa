-- Add channel_type to whatsapp_config to distinguish Meta API vs Evolution API
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT 'meta_api';

-- Add evolution-specific fields
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS evolution_instance_name text,
ADD COLUMN IF NOT EXISTS evolution_instance_status text DEFAULT 'disconnected';

COMMENT ON COLUMN public.whatsapp_config.channel_type IS 'meta_api or evolution';
COMMENT ON COLUMN public.whatsapp_config.evolution_instance_name IS 'Evolution API instance name';
COMMENT ON COLUMN public.whatsapp_config.evolution_instance_status IS 'Evolution instance connection status';