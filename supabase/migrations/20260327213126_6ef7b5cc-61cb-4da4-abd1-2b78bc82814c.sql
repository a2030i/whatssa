
-- Add supervisor to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own teams" ON public.teams FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins manage teams" ON public.teams FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Add team_id and online status to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS work_start TIME DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end TIME DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS work_days INTEGER[] DEFAULT '{0,1,2,3,4}';

-- Customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, phone)
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own customers" ON public.customers FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Org members manage customers" ON public.customers FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

-- Closure reasons table  
CREATE TABLE public.closure_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.closure_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own reasons" ON public.closure_reasons FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins manage reasons" ON public.closure_reasons FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Add closure fields to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID,
  ADD COLUMN IF NOT EXISTS closure_reason_id UUID REFERENCES public.closure_reasons(id),
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Customer tags lookup table
CREATE TABLE public.customer_tag_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#25D366',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, name)
);
ALTER TABLE public.customer_tag_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own tag defs" ON public.customer_tag_definitions FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Admins manage tag defs" ON public.customer_tag_definitions FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));
