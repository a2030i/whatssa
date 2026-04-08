
-- Plan Modules: each configurable feature/resource
CREATE TABLE public.plan_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name_ar text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  pricing_type text NOT NULL DEFAULT 'per_unit', -- per_unit | toggle | included
  unit_price numeric NOT NULL DEFAULT 0,
  unit_label text DEFAULT 'وحدة',
  min_qty integer DEFAULT 0,
  max_qty integer DEFAULT 999,
  free_qty integer DEFAULT 0,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.plan_modules ENABLE ROW LEVEL SECURITY;

-- Super admins manage, authenticated users can read active modules
CREATE POLICY "Super admins manage plan_modules"
  ON public.plan_modules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated users read active modules"
  ON public.plan_modules FOR SELECT TO authenticated
  USING (is_active = true);

-- Org Module Subscriptions: what each org has chosen
CREATE TABLE public.org_module_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.plan_modules(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT false,
  monthly_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, module_id)
);

ALTER TABLE public.org_module_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage org subscriptions"
  ON public.org_module_subscriptions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Org admins read own subscriptions"
  ON public.org_module_subscriptions FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Org admins manage own subscriptions"
  ON public.org_module_subscriptions FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

-- Org AI Wallets: separate AI balance per org
CREATE TABLE public.org_ai_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_sar numeric NOT NULL DEFAULT 0,
  total_charged_sar numeric NOT NULL DEFAULT 0,
  total_consumed_sar numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.org_ai_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage ai wallets"
  ON public.org_ai_wallets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Org admins read own wallet"
  ON public.org_ai_wallets FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Org admins update own wallet"
  ON public.org_ai_wallets FOR UPDATE TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'))
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'));
