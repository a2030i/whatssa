
-- Create shipment events table for tracking timeline
CREATE TABLE public.shipment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status_key TEXT NOT NULL,
  status_label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'lamha',
  tracking_number TEXT,
  carrier TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_shipment_events_order ON public.shipment_events(order_id);
CREATE INDEX idx_shipment_events_org ON public.shipment_events(org_id);

-- Enable RLS
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- Members can view their org's shipment events
CREATE POLICY "Members can view org shipment events"
ON public.shipment_events FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()));
