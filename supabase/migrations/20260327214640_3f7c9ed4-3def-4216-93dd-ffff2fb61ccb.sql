
-- Add is_ecommerce flag to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_ecommerce BOOLEAN DEFAULT false;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS store_url TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS store_platform TEXT; -- shopify, woocommerce, salla, zid, custom

-- Products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price NUMERIC(12,2),
  currency TEXT DEFAULT 'SAR',
  sku TEXT,
  category TEXT,
  image_url TEXT,
  stock_quantity INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own products" ON public.products FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Org members manage products" ON public.products FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
CREATE INDEX idx_products_org ON public.products(org_id);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id TEXT,
  order_number TEXT,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_city TEXT,
  customer_region TEXT,
  customer_address TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT DEFAULT 'unpaid',
  payment_method TEXT,
  subtotal NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  shipping_amount NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'SAR',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own orders" ON public.orders FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Org members manage orders" ON public.orders FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
CREATE INDEX idx_orders_org ON public.orders(org_id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created ON public.orders(created_at);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND (o.org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))));
CREATE POLICY "Org members manage order items" ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.org_id = get_user_org_id(auth.uid())));

-- Abandoned carts
CREATE TABLE public.abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id TEXT,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  items JSONB DEFAULT '[]',
  total NUMERIC(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'SAR',
  recovery_status TEXT DEFAULT 'pending',
  reminder_sent_at TIMESTAMPTZ,
  reminder_count INTEGER DEFAULT 0,
  recovered_at TIMESTAMPTZ,
  recovered_order_id UUID REFERENCES public.orders(id),
  checkout_url TEXT,
  abandoned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members see own carts" ON public.abandoned_carts FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Org members manage carts" ON public.abandoned_carts FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
CREATE INDEX idx_abandoned_carts_org ON public.abandoned_carts(org_id);
CREATE INDEX idx_abandoned_carts_status ON public.abandoned_carts(recovery_status);
