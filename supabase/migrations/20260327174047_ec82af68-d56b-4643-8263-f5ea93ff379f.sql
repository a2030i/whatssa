-- 1. Wallets table - each org has a wallet
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Wallet transactions
CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) NOT NULL,
  type TEXT NOT NULL, -- credit, debit, refund, subscription, coupon
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  description TEXT,
  reference_type TEXT, -- subscription, manual, coupon, api
  reference_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Coupons table
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage', -- percentage, fixed
  discount_value DECIMAL(10,2) NOT NULL,
  max_uses INTEGER DEFAULT 0, -- 0 = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  min_plan_price DECIMAL(10,2) DEFAULT 0,
  applicable_plans UUID[] DEFAULT '{}',
  valid_from TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Coupon redemptions
CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, org_id)
);

-- 5. Usage tracking per org per month
CREATE TABLE public.usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  period TEXT NOT NULL, -- YYYY-MM format
  messages_sent INTEGER NOT NULL DEFAULT 0,
  messages_received INTEGER NOT NULL DEFAULT 0,
  conversations_count INTEGER NOT NULL DEFAULT 0,
  api_calls INTEGER NOT NULL DEFAULT 0,
  storage_used_mb DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, period)
);

-- 6. System settings for super admin
CREATE TABLE public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- 7. Activity logs for admin audit
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  actor_type TEXT NOT NULL DEFAULT 'user', -- user, system, admin
  action TEXT NOT NULL,
  target_type TEXT, -- org, user, plan, coupon, wallet
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Wallets: org members see own, super_admin sees all
CREATE POLICY "Org sees own wallet" ON public.wallets
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "Super admin manages wallets" ON public.wallets
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Wallet transactions
CREATE POLICY "Org sees own transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "Super admin manages transactions" ON public.wallet_transactions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Coupons: readable by authenticated, managed by super_admin
CREATE POLICY "Authenticated read active coupons" ON public.coupons
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Super admin manages coupons" ON public.coupons
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Coupon redemptions
CREATE POLICY "Org sees own redemptions" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "Super admin manages redemptions" ON public.coupon_redemptions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Usage tracking
CREATE POLICY "Org sees own usage" ON public.usage_tracking
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );
CREATE POLICY "Super admin manages usage" ON public.usage_tracking
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- System settings: super_admin only
CREATE POLICY "Super admin manages settings" ON public.system_settings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Activity logs: super_admin reads all
CREATE POLICY "Super admin reads logs" ON public.activity_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "System inserts logs" ON public.activity_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Auto-create wallet when org is created
CREATE OR REPLACE FUNCTION public.handle_new_org_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (org_id) VALUES (NEW.id);
  INSERT INTO public.usage_tracking (org_id, period) 
  VALUES (NEW.id, to_char(now(), 'YYYY-MM'));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_org_created_wallet
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_org_wallet();

-- Create wallets for existing orgs
INSERT INTO public.wallets (org_id)
SELECT id FROM public.organizations
WHERE id NOT IN (SELECT org_id FROM public.wallets);

-- Create usage records for existing orgs
INSERT INTO public.usage_tracking (org_id, period)
SELECT id, to_char(now(), 'YYYY-MM') FROM public.organizations
WHERE id NOT IN (SELECT org_id FROM public.usage_tracking);

-- Seed system settings
INSERT INTO public.system_settings (key, value, description) VALUES
('platform_name', '"واتس ديسك"', 'اسم المنصة'),
('maintenance_mode', 'false', 'وضع الصيانة'),
('default_trial_days', '14', 'أيام الفترة التجريبية'),
('max_file_upload_mb', '25', 'الحد الأقصى لحجم الملف بالميجابايت'),
('message_rate_limit', '100', 'حد الرسائل في الدقيقة')
ON CONFLICT (key) DO NOTHING;