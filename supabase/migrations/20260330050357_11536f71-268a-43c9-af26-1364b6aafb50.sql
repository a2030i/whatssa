
-- 1) Usage tracking: auto-increment on new messages
CREATE OR REPLACE FUNCTION public.track_message_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _period text;
BEGIN
  SELECT org_id INTO _org_id FROM conversations WHERE id = NEW.conversation_id;
  IF _org_id IS NULL THEN RETURN NEW; END IF;
  _period := to_char(now(), 'YYYY-MM');
  
  INSERT INTO usage_tracking (org_id, period, messages_sent, messages_received)
  VALUES (
    _org_id, _period,
    CASE WHEN NEW.sender = 'agent' THEN 1 ELSE 0 END,
    CASE WHEN NEW.sender = 'customer' THEN 1 ELSE 0 END
  )
  ON CONFLICT (org_id, period) DO UPDATE SET
    messages_sent = usage_tracking.messages_sent + CASE WHEN NEW.sender = 'agent' THEN 1 ELSE 0 END,
    messages_received = usage_tracking.messages_received + CASE WHEN NEW.sender = 'customer' THEN 1 ELSE 0 END,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- 2) Usage tracking: auto-increment on new conversations
CREATE OR REPLACE FUNCTION public.track_conversation_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period text;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  _period := to_char(now(), 'YYYY-MM');
  
  INSERT INTO usage_tracking (org_id, period, conversations_count)
  VALUES (NEW.org_id, _period, 1)
  ON CONFLICT (org_id, period) DO UPDATE SET
    conversations_count = usage_tracking.conversations_count + 1,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- 3) Usage tracking: auto-increment API calls
CREATE OR REPLACE FUNCTION public.track_api_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _period text;
BEGIN
  _org_id := NEW.org_id;
  IF _org_id IS NULL THEN RETURN NEW; END IF;
  _period := to_char(now(), 'YYYY-MM');
  
  INSERT INTO usage_tracking (org_id, period, api_calls)
  VALUES (_org_id, _period, 1)
  ON CONFLICT (org_id, period) DO UPDATE SET
    api_calls = usage_tracking.api_calls + 1,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Add unique constraint for upsert
ALTER TABLE usage_tracking ADD CONSTRAINT usage_tracking_org_period_unique UNIQUE (org_id, period);

-- Create triggers
CREATE TRIGGER on_message_insert_track_usage
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.track_message_usage();

CREATE TRIGGER on_conversation_insert_track_usage
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.track_conversation_usage();

-- 4) CRM: Add lifecycle_stage and custom_fields to customers
ALTER TABLE public.customers 
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'whatsapp';

-- 5) Message retry queue
CREATE TABLE public.message_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  content text,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  template_name text,
  template_language text DEFAULT 'ar',
  template_components jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  channel_type text NOT NULL DEFAULT 'meta_api',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  last_error text,
  last_attempted_at timestamptz,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.message_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members see own retry queue" ON public.message_retry_queue
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin manages retry queue" ON public.message_retry_queue
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_retry_queue_pending ON public.message_retry_queue (next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_retry_queue_org ON public.message_retry_queue (org_id);

-- 6) Outgoing webhooks table for external integrations
CREATE TABLE public.org_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  events text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage webhooks" ON public.org_webhooks
  FOR ALL TO authenticated
  USING ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK ((org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- 7) Enhanced audit: add org_id to activity_logs for tenant isolation
ALTER TABLE public.activity_logs 
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
