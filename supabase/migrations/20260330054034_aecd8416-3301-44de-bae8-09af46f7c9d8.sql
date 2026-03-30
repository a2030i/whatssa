
-- Table to support multiple store integrations per org
CREATE TABLE public.store_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'salla', -- salla, zid, shopify
  store_name text,
  store_url text,
  webhook_secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active boolean NOT NULL DEFAULT true,
  last_webhook_at timestamptz,
  webhook_error text,
  events_enabled text[] NOT NULL DEFAULT '{order.created,order.status.updated,customer.created,abandoned.cart,abandoned.cart.purchased}'::text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;

-- Admins manage store integrations
CREATE POLICY "Admins manage store integrations"
ON public.store_integrations FOR ALL TO authenticated
USING (
  ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  ((org_id = get_user_org_id(auth.uid())) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Members can view
CREATE POLICY "Org members see store integrations"
ON public.store_integrations FOR SELECT TO authenticated
USING (
  (org_id = get_user_org_id(auth.uid()))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
