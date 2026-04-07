
-- 1. Create white_label_partners table
CREATE TABLE public.white_label_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '#7c3aed',
  secondary_color text DEFAULT '#a78bfa',
  accent_color text DEFAULT '#f59e0b',
  background_color text DEFAULT '#ffffff',
  foreground_color text DEFAULT '#1a1a2e',
  custom_domain text UNIQUE,
  support_email text,
  support_phone text,
  privacy_policy_url text,
  terms_url text,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Add partner_id to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.white_label_partners(id);

-- 3. Add partner_id to profiles (for partner admins)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.white_label_partners(id);

-- 4. Enable RLS
ALTER TABLE public.white_label_partners ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Super admins manage all partners"
  ON public.white_label_partners FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Partner admins view own partner"
  ON public.white_label_partners FOR SELECT
  TO authenticated
  USING (
    id = (SELECT p.partner_id FROM profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "Public read active partners"
  ON public.white_label_partners FOR SELECT
  TO anon
  USING (is_active = true);

-- 6. Insert default Respondly partner
INSERT INTO public.white_label_partners (name, slug, primary_color, secondary_color, accent_color, is_default, is_active)
VALUES ('Respondly', 'respondly', '#7c3aed', '#a78bfa', '#f59e0b', true, true);

-- 7. Link all existing organizations to Respondly
UPDATE public.organizations SET partner_id = (
  SELECT id FROM public.white_label_partners WHERE slug = 'respondly'
) WHERE partner_id IS NULL;

-- 8. Helper functions
CREATE OR REPLACE FUNCTION public.get_user_partner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    p.partner_id,
    o.partner_id
  )
  FROM profiles p
  LEFT JOIN organizations o ON o.id = p.org_id
  WHERE p.id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_partner_admin(_user_id uuid, _partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'partner_admin'
      AND p.partner_id = _partner_id
  )
$$;

-- 9. Updated at trigger
CREATE TRIGGER update_white_label_partners_updated_at
  BEFORE UPDATE ON public.white_label_partners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
