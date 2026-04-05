CREATE TABLE IF NOT EXISTS public.health_check_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL DEFAULT 'external_supabase',
  status TEXT NOT NULL DEFAULT 'healthy',
  latency_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_health_check_logs_created ON public.health_check_logs (created_at DESC);

ALTER TABLE public.health_check_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow edge functions to insert" ON public.health_check_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Super admins can read" ON public.health_check_logs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'super_admin')
  );