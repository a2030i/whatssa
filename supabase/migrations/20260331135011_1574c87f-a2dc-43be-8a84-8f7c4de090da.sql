
-- WhatsApp Flows table - stores flow definitions
CREATE TABLE public.wa_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  flow_type text NOT NULL DEFAULT 'form', -- form, order, survey, appointment
  status text NOT NULL DEFAULT 'draft', -- draft, published, archived
  screens jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of screen definitions
  success_message text DEFAULT 'شكراً لك! تم استلام ردك بنجاح ✅',
  meta_flow_id text, -- Meta's flow ID after publishing
  webhook_url text, -- optional external webhook to forward submissions
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flow submissions table - stores customer responses
CREATE TABLE public.flow_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  flow_id uuid REFERENCES public.wa_flows(id) ON DELETE CASCADE NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_phone text NOT NULL,
  customer_name text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb, -- key-value pairs of field responses
  status text NOT NULL DEFAULT 'new', -- new, processed, archived
  metadata jsonb, -- extra data like order details
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wa_flows_org ON public.wa_flows(org_id);
CREATE INDEX idx_wa_flows_status ON public.wa_flows(org_id, status);
CREATE INDEX idx_flow_submissions_org ON public.flow_submissions(org_id);
CREATE INDEX idx_flow_submissions_flow ON public.flow_submissions(flow_id);
CREATE INDEX idx_flow_submissions_status ON public.flow_submissions(org_id, status);

-- RLS
ALTER TABLE public.wa_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flow_submissions ENABLE ROW LEVEL SECURITY;

-- Policies for wa_flows
CREATE POLICY "Users can view own org flows"
ON public.wa_flows FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage flows"
ON public.wa_flows FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- Policies for flow_submissions
CREATE POLICY "Users can view own org submissions"
ON public.flow_submissions FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can insert submissions"
ON public.flow_submissions FOR INSERT TO authenticated
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users can update own org submissions"
ON public.flow_submissions FOR UPDATE TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

-- Service role can insert submissions (from webhook)
CREATE POLICY "Service role full access flows"
ON public.wa_flows FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access submissions"
ON public.flow_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated at trigger
CREATE TRIGGER update_wa_flows_updated_at
  BEFORE UPDATE ON public.wa_flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
