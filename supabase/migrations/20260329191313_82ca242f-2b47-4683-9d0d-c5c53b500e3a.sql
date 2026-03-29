-- API tokens table
CREATE TABLE public.api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  permissions text[] NOT NULL DEFAULT '{messages,customers,orders,conversations}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(token)
);

-- Enable RLS
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Admins manage their org's tokens
CREATE POLICY "Admins manage own tokens"
ON public.api_tokens
FOR ALL
TO authenticated
USING (
  (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Org members can view tokens
CREATE POLICY "Org members see own tokens"
ON public.api_tokens
FOR SELECT
TO authenticated
USING (
  org_id = get_user_org_id(auth.uid())
  OR has_role(auth.uid(), 'super_admin'::app_role)
);