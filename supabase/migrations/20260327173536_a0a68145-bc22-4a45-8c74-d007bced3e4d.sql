-- 1. Create app_role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'member');

-- 2. Plans table
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SAR',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  max_conversations INTEGER NOT NULL DEFAULT 100,
  max_messages_per_month INTEGER NOT NULL DEFAULT 1000,
  max_team_members INTEGER NOT NULL DEFAULT 1,
  max_phone_numbers INTEGER NOT NULL DEFAULT 1,
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  plan_id UUID REFERENCES public.plans(id),
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE (user_id, role)
);

-- 6. Add org_id to existing tables
ALTER TABLE public.conversations ADD COLUMN org_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.whatsapp_config ADD COLUMN org_id UUID REFERENCES public.organizations(id);

-- 7. Enable RLS on all new tables
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 8. Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 9. Get user org_id helper
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id
$$;

-- 10. RLS Policies

-- Plans: readable by all authenticated, writable by super_admin
CREATE POLICY "Anyone can read active plans" ON public.plans
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Super admin manages plans" ON public.plans
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Organizations: members see their own org, super_admin sees all
CREATE POLICY "Members see own org" ON public.organizations
  FOR SELECT TO authenticated USING (
    id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Super admin manages orgs" ON public.organizations
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins update own org" ON public.organizations
  FOR UPDATE TO authenticated USING (
    id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin')
  );

-- Profiles
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid() OR 
    org_id = public.get_user_org_id(auth.uid()) OR 
    public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "Allow insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- User roles
CREATE POLICY "Super admin manages roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Conversations: org isolation
CREATE POLICY "Org members see own conversations" ON public.conversations
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org members insert conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    org_id = public.get_user_org_id(auth.uid())
  );

CREATE POLICY "Org members update conversations" ON public.conversations
  FOR UPDATE TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid())
  );

-- WhatsApp config: org isolation
CREATE POLICY "Org members see own config" ON public.whatsapp_config
  FOR SELECT TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org members manage config" ON public.whatsapp_config
  FOR ALL TO authenticated USING (
    org_id = public.get_user_org_id(auth.uid())
  );

-- 11. Auto-create profile + org on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
  free_plan_id UUID;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE price = 0 AND is_active = true LIMIT 1;
  
  INSERT INTO public.organizations (name, plan_id, subscription_status)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || ' - Organization',
    free_plan_id,
    'trial'
  )
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, org_id, full_name)
  VALUES (
    NEW.id,
    new_org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 12. Seed default plans
INSERT INTO public.plans (name, name_ar, description, price, max_conversations, max_messages_per_month, max_team_members, max_phone_numbers, sort_order, features) VALUES
('مجاني', 'مجاني', 'للتجربة', 0, 50, 500, 1, 1, 1, '["50 محادثة", "500 رسالة/شهر", "عضو واحد"]'::jsonb),
('أساسي', 'أساسي', 'للمشاريع الصغيرة', 99, 500, 5000, 3, 1, 2, '["500 محادثة", "5000 رسالة/شهر", "3 أعضاء", "شات بوت أساسي"]'::jsonb),
('احترافي', 'احترافي', 'للشركات المتوسطة', 299, 2000, 25000, 10, 3, 3, '["2000 محادثة", "25000 رسالة/شهر", "10 أعضاء", "3 أرقام", "حملات", "تقارير متقدمة"]'::jsonb),
('مؤسسي', 'مؤسسي', 'للمؤسسات الكبيرة', 799, 999999, 999999, 999, 10, 4, '["محادثات لا محدودة", "رسائل لا محدودة", "أعضاء لا محدود", "10 أرقام", "API كامل", "دعم مخصص"]'::jsonb);

-- 13. Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;