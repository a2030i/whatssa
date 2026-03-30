
-- Payments table for Moyasar transactions
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.plans(id),
  payment_type TEXT NOT NULL DEFAULT 'subscription', -- subscription, addon_qr
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, failed, refunded
  moyasar_payment_id TEXT,
  moyasar_source_type TEXT, -- creditcard, stcpay, applepay
  billing_cycle TEXT DEFAULT 'monthly', -- monthly, yearly
  addon_quantity INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  callback_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  created_by UUID
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Org members can see their own payments
CREATE POLICY "Org members see own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Org members can create payments
CREATE POLICY "Org members create payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Super admin manages all payments
CREATE POLICY "Super admin manages payments" ON public.payments
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Service role updates (for webhook)
CREATE POLICY "Service updates payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
