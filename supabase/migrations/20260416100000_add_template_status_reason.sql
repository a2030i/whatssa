ALTER TABLE public.template_status_cache
ADD COLUMN IF NOT EXISTS reason text;

