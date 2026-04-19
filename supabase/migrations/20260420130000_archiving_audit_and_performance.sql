-- Data Archiving + Audit Log + DB Functions for Scale
CREATE TABLE IF NOT EXISTS conversations_archive (LIKE conversations INCLUDING ALL);
ALTER TABLE conversations_archive ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_conv_archive_org ON conversations_archive (org_id, archived_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES organizations(id) ON DELETE SET NULL,
  action      text NOT NULL,
  target_type text,
  target_id   text,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON admin_audit_log (org_id, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON admin_audit_log (target_type, target_id, created_at DESC) WHERE target_id IS NOT NULL;

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_read_audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'super_admin'));
CREATE POLICY "insert_own_audit" ON admin_audit_log FOR INSERT
  WITH CHECK (actor_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION archive_old_conversations(days_old int DEFAULT 180)
RETURNS int LANGUAGE plpgsql SET search_path = public AS $$
DECLARE moved_count int;
BEGIN
  INSERT INTO conversations_archive SELECT c.*, now() FROM conversations c
  WHERE c.status = 'closed' AND c.closed_at < now() - (days_old || ' days')::interval AND c.deleted_at IS NULL
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS moved_count = ROW_COUNT;
  RETURN moved_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_conversations(p_org_id uuid, p_query text, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS SETOF conversations LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT * FROM conversations WHERE org_id = p_org_id AND deleted_at IS NULL
  AND (search_vector @@ plainto_tsquery('simple', p_query) OR customer_phone ILIKE '%' || p_query || '%')
  ORDER BY last_message_at DESC LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION search_messages(p_org_id uuid, p_query text, p_limit int DEFAULT 30, p_offset int DEFAULT 0)
RETURNS TABLE(message_id uuid, conversation_id uuid, content text, sender text, created_at timestamptz, customer_phone text, customer_name text)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT m.id, m.conversation_id, m.content, m.sender, m.created_at, c.customer_phone, c.customer_name
  FROM messages m JOIN conversations c ON c.id = m.conversation_id
  WHERE m.org_id = p_org_id AND m.deleted_at IS NULL AND m.search_vector @@ plainto_tsquery('simple', p_query)
  ORDER BY m.created_at DESC LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION transfer_conversation(
  p_conversation_id uuid, p_to_agent_id uuid DEFAULT NULL,
  p_to_team_id uuid DEFAULT NULL, p_reason text DEFAULT NULL, p_note text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_actor_id      uuid := (SELECT auth.uid());
  v_org_id        uuid;
  v_from_agent_id uuid;
  v_from_team_id  uuid;
  v_transfer_id   uuid;
BEGIN
  SELECT org_id, assigned_to_id, assigned_team_id INTO v_org_id, v_from_agent_id, v_from_team_id
  FROM conversations WHERE id = p_conversation_id;
  UPDATE conversations SET assigned_to_id = p_to_agent_id,
    assigned_team_id = coalesce(p_to_team_id, assigned_team_id), assigned_at = now(), updated_at = now()
  WHERE id = p_conversation_id;
  INSERT INTO conversation_transfers (conversation_id, org_id, transferred_by, from_agent_id, to_agent_id, from_team_id, to_team_id, reason, note)
  VALUES (p_conversation_id, v_org_id, v_actor_id, v_from_agent_id, p_to_agent_id, v_from_team_id, p_to_team_id, p_reason, p_note)
  RETURNING id INTO v_transfer_id;
  RETURN v_transfer_id;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_usage_tracking_org_date ON usage_tracking (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_perf_org_date ON agent_performance_daily (org_id, date DESC);
