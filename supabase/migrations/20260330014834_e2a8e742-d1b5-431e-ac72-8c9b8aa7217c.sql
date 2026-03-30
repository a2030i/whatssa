
-- System logs table for troubleshooting
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info', -- info, warn, error, critical
  source text NOT NULL DEFAULT 'system', -- edge_function, frontend, webhook, system
  function_name text, -- e.g. moyasar-webhook, whatsapp-send
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  request_id text,
  stack_trace text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast querying
CREATE INDEX idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX idx_system_logs_level ON public.system_logs(level);
CREATE INDEX idx_system_logs_source ON public.system_logs(source);
CREATE INDEX idx_system_logs_org_id ON public.system_logs(org_id);

-- RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "System inserts logs"
  ON public.system_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow service role (edge functions) to insert without auth
CREATE POLICY "Anon and service insert logs"
  ON public.system_logs FOR INSERT
  TO anon
  WITH CHECK (true);
