
-- Campaigns table
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_name TEXT,
  template_language TEXT DEFAULT 'ar',
  template_variables JSONB DEFAULT '[]',
  audience_type TEXT NOT NULL DEFAULT 'all',
  audience_tags TEXT[] DEFAULT '{}',
  exclude_tags TEXT[] DEFAULT '{}',
  exclude_campaign_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own campaigns" ON public.campaigns FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Org members manage campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

-- Campaign recipients table
CREATE TABLE public.campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  customer_name TEXT,
  variables JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  wa_message_id TEXT,
  error_code TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own recipients" ON public.campaign_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_recipients.campaign_id AND (c.org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org members manage recipients" ON public.campaign_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_recipients.campaign_id AND c.org_id = get_user_org_id(auth.uid())));

CREATE INDEX idx_campaign_recipients_campaign ON public.campaign_recipients(campaign_id);
CREATE INDEX idx_campaign_recipients_status ON public.campaign_recipients(status);
CREATE INDEX idx_campaigns_org ON public.campaigns(org_id);
