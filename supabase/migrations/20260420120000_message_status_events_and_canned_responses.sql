-- Message Status Events + Enhanced Saved Replies + Notifications Index
CREATE TABLE IF NOT EXISTS message_status_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id      uuid REFERENCES messages(id) ON DELETE SET NULL,
  wa_message_id   text,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  event_type      text NOT NULL,
  error_code      text,
  error_message   text,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_status_events_message ON message_status_events (message_id, occurred_at DESC) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_status_events_wa_id ON message_status_events (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_status_events_org_occurred ON message_status_events (org_id, occurred_at DESC);

ALTER TABLE message_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_msg_status" ON message_status_events FOR SELECT
  USING (org_id = (SELECT org_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "service_role_all_msg_status" ON message_status_events FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE saved_replies ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
ALTER TABLE saved_replies ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_saved_replies_org_category ON saved_replies (org_id, category);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, created_at DESC) WHERE is_read = false;

ALTER TABLE internal_notes ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE internal_notes SET search_vector = to_tsvector('simple', coalesce(content, '')) WHERE search_vector IS NULL;
CREATE INDEX IF NOT EXISTS idx_internal_notes_search ON internal_notes USING gin(search_vector);

CREATE OR REPLACE FUNCTION internal_notes_search_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := to_tsvector('simple', coalesce(NEW.content, '')); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_internal_notes_search ON internal_notes;
CREATE TRIGGER trg_internal_notes_search BEFORE INSERT OR UPDATE OF content ON internal_notes
  FOR EACH ROW EXECUTE FUNCTION internal_notes_search_update();

CREATE INDEX IF NOT EXISTS idx_follow_up_scheduled ON follow_up_reminders (scheduled_at, org_id) WHERE status = 'pending';
