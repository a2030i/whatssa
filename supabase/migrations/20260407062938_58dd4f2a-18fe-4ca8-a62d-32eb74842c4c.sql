
-- Widget configs table
CREATE TABLE public.widget_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL DEFAULT 'whatsapp_button',
  phone_number TEXT NOT NULL,
  welcome_message TEXT DEFAULT 'مرحباً! كيف يمكننا مساعدتك؟',
  button_color TEXT DEFAULT '#25D366',
  button_position TEXT DEFAULT 'bottom-right',
  button_size TEXT DEFAULT 'medium',
  show_on_mobile BOOLEAN DEFAULT true,
  delay_seconds INTEGER DEFAULT 3,
  page_rules JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  click_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Short links table
CREATE TABLE public.short_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  short_code TEXT NOT NULL UNIQUE,
  target_phone TEXT NOT NULL,
  prefilled_message TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  title TEXT,
  click_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Short link clicks tracking
CREATE TABLE public.short_link_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID NOT NULL REFERENCES public.short_links(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  country TEXT,
  city TEXT,
  device_type TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Zapier incoming webhooks table
CREATE TABLE public.zapier_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Zapier Webhook',
  webhook_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  allowed_actions TEXT[] DEFAULT ARRAY['create_customer', 'send_message', 'create_conversation']::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A/B test variants for campaigns
CREATE TABLE public.campaign_ab_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL DEFAULT 'A',
  template_name TEXT,
  template_language TEXT,
  template_variables JSONB,
  recipient_percentage INTEGER NOT NULL DEFAULT 50,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add ab_test_enabled to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS winning_variant_id UUID REFERENCES public.campaign_ab_variants(id);

-- RLS policies
ALTER TABLE public.widget_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.short_link_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zapier_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_ab_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own org widget_configs" ON public.widget_configs
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users manage own org short_links" ON public.short_links
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users manage own org short_link_clicks" ON public.short_link_clicks
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users manage own org zapier_webhooks" ON public.zapier_webhooks
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Users manage own org campaign_ab_variants" ON public.campaign_ab_variants
  FOR ALL TO authenticated
  USING (campaign_id IN (SELECT id FROM public.campaigns WHERE org_id = public.get_user_org_id(auth.uid())))
  WITH CHECK (campaign_id IN (SELECT id FROM public.campaigns WHERE org_id = public.get_user_org_id(auth.uid())));

-- Indexes
CREATE INDEX idx_short_links_short_code ON public.short_links(short_code);
CREATE INDEX idx_short_link_clicks_link_id ON public.short_link_clicks(link_id);
CREATE INDEX idx_zapier_webhooks_token ON public.zapier_webhooks(webhook_token);
CREATE INDEX idx_widget_configs_org ON public.widget_configs(org_id);
CREATE INDEX idx_campaign_ab_variants_campaign ON public.campaign_ab_variants(campaign_id);
