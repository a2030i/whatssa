
-- Table to store SMTP/email configuration per organization
CREATE TABLE public.email_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  smtp_host TEXT NOT NULL DEFAULT 'smtp.gmail.com',
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_username TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  encryption TEXT NOT NULL DEFAULT 'ssl',
  imap_host TEXT DEFAULT 'imap.gmail.com',
  imap_port INTEGER DEFAULT 993,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, email_address)
);

-- Enable RLS
ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;

-- RLS: members of the org can view
CREATE POLICY "org_members_select" ON public.email_configs
  FOR SELECT TO authenticated
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS: admins can insert
CREATE POLICY "org_admins_insert" ON public.email_configs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- RLS: admins can update
CREATE POLICY "org_admins_update" ON public.email_configs
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- RLS: admins can delete
CREATE POLICY "org_admins_delete" ON public.email_configs
  FOR DELETE TO authenticated
  USING (
    org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  );
