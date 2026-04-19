-- Conversation Transfers Table
CREATE TABLE IF NOT EXISTS conversation_transfers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transferred_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  from_agent_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  to_agent_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  from_team_id    uuid REFERENCES teams(id) ON DELETE SET NULL,
  to_team_id      uuid REFERENCES teams(id) ON DELETE SET NULL,
  reason          text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_transfers_conversation ON conversation_transfers (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_transfers_org ON conversation_transfers (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_transfers_to_agent ON conversation_transfers (to_agent_id, created_at DESC) WHERE to_agent_id IS NOT NULL;

ALTER TABLE conversation_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_transfers" ON conversation_transfers FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "org_members_insert_transfers" ON conversation_transfers FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "super_admin_all_transfers" ON conversation_transfers FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'super_admin'));
