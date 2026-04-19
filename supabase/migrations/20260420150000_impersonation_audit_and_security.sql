-- Impersonation audit log security hardening
ALTER TABLE impersonation_logs ADD COLUMN IF NOT EXISTS super_admin_name text;
ALTER TABLE impersonation_logs ADD COLUMN IF NOT EXISTS ip_address    inet;
ALTER TABLE impersonation_logs ADD COLUMN IF NOT EXISTS user_agent    text;

ALTER TABLE impersonation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_all_impersonation_logs" ON impersonation_logs;
CREATE POLICY "super_admin_all_impersonation_logs" ON impersonation_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_impersonation_logs_admin ON impersonation_logs (super_admin_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_logs_org   ON impersonation_logs (target_org_id, started_at DESC);
