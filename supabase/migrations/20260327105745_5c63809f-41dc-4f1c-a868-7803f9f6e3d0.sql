
-- WhatsApp API Configuration
CREATE TABLE public.whatsapp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id text NOT NULL,
  business_account_id text NOT NULL,
  access_token text NOT NULL,
  webhook_verify_token text NOT NULL DEFAULT gen_random_uuid()::text,
  display_phone text,
  business_name text,
  is_connected boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view config" ON public.whatsapp_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert config" ON public.whatsapp_config FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update config" ON public.whatsapp_config FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Anon can read config for webhook" ON public.whatsapp_config FOR SELECT TO anon USING (true);

-- Conversations table
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_conversation_id text,
  customer_phone text NOT NULL,
  customer_name text,
  customer_profile_pic text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'closed')),
  assigned_to text,
  assigned_team text,
  tags text[] DEFAULT '{}',
  notes text,
  last_message text,
  last_message_at timestamptz DEFAULT now(),
  unread_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view conversations" ON public.conversations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert conversations" ON public.conversations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update conversations" ON public.conversations FOR UPDATE TO authenticated USING (true);

-- Messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  wa_message_id text,
  sender text NOT NULL CHECK (sender IN ('customer', 'agent', 'system')),
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'template', 'note')),
  content text NOT NULL,
  media_url text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update messages" ON public.messages FOR UPDATE TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_customer_phone ON public.conversations(customer_phone);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_whatsapp_config_updated_at BEFORE UPDATE ON public.whatsapp_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
