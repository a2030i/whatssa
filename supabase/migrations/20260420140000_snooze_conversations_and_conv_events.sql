-- Snooze Conversations + Conversation Events Log + Campaign A/B Testing
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snoozed_until timestamptz DEFAULT NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snoozed_by   uuid REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_snoozed ON conversations (snoozed_until) WHERE snoozed_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type      text NOT NULL,
  payload         jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_events_conversation ON conversation_events (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_conv_events_org_created ON conversation_events (org_id, created_at DESC);

ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_conv_events" ON conversation_events FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "org_members_insert_conv_events" ON conversation_events FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "super_admin_all_conv_events" ON conversation_events FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = (SELECT auth.uid()) AND role = 'super_admin'));

CREATE OR REPLACE FUNCTION snooze_conversation(p_conversation_id uuid, p_until timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_org uuid; v_name text;
BEGIN
  SELECT org_id INTO v_org FROM conversations WHERE id = p_conversation_id;
  SELECT full_name INTO v_name FROM profiles WHERE id = v_actor;
  UPDATE conversations SET snoozed_until = p_until, snoozed_by = v_actor, updated_at = now() WHERE id = p_conversation_id;
  INSERT INTO conversation_events (conversation_id, org_id, actor_id, event_type, payload)
  VALUES (p_conversation_id, v_org, v_actor, 'snoozed', jsonb_build_object('until', p_until, 'actor_name', v_name));
END;
$$;

CREATE OR REPLACE FUNCTION unsnooze_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT org_id INTO v_org FROM conversations WHERE id = p_conversation_id;
  UPDATE conversations SET snoozed_until = NULL, snoozed_by = NULL, updated_at = now() WHERE id = p_conversation_id;
  INSERT INTO conversation_events (conversation_id, org_id, actor_id, event_type, payload)
  VALUES (p_conversation_id, v_org, NULL, 'unsnoozed', '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION log_conversation_event(p_conversation_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_actor uuid := (SELECT auth.uid()); v_org uuid; v_id uuid;
BEGIN
  SELECT org_id INTO v_org FROM conversations WHERE id = p_conversation_id;
  INSERT INTO conversation_events (conversation_id, org_id, actor_id, event_type, payload)
  VALUES (p_conversation_id, v_org, v_actor, p_event_type, p_payload) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_ab_test       boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_variant       text DEFAULT NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_split_percent integer DEFAULT 50;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_winner        text DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_ab_parent ON campaigns (parent_campaign_id, ab_variant) WHERE is_ab_test = true;
