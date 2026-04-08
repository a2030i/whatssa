
-- Campaign queue table for chunked processing
CREATE TABLE public.campaign_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chunk_index int NOT NULL DEFAULT 0,
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  chunk_size int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queue processing
CREATE INDEX idx_campaign_queue_status ON public.campaign_queue(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_campaign_queue_campaign ON public.campaign_queue(campaign_id);
CREATE INDEX idx_campaign_queue_org ON public.campaign_queue(org_id);

-- Enable RLS
ALTER TABLE public.campaign_queue ENABLE ROW LEVEL SECURITY;

-- RLS: users can view their org's queue
CREATE POLICY "Users can view own org queue"
  ON public.campaign_queue FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- RLS: service role can do everything (edge functions)
CREATE POLICY "Service role full access"
  ON public.campaign_queue FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
