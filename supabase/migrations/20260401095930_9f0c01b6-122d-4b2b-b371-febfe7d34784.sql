ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_status text DEFAULT null;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_carrier text DEFAULT null;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipment_tracking_number text DEFAULT null;