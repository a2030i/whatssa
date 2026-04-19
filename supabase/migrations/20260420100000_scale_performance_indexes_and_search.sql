-- Scale to Millions: Composite Indexes + Full-Text Search + Soft Delete
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_org_conv_created ON messages (org_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE messages SET search_vector = to_tsvector('simple', coalesce(content, '')) WHERE search_vector IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON messages USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm ON messages USING gin(content gin_trgm_ops);

CREATE OR REPLACE FUNCTION messages_search_vector_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.search_vector := to_tsvector('simple', coalesce(NEW.content, '')); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_messages_search_vector ON messages;
CREATE TRIGGER trg_messages_search_vector BEFORE INSERT OR UPDATE OF content ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_search_vector_update();

ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_not_deleted ON messages (conversation_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_inbox ON conversations (org_id, status, last_message_at DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_conversations_agent_inbox ON conversations (org_id, assigned_to_id, status, last_message_at DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_conversations_team_inbox ON conversations (org_id, assigned_team_id, status, last_message_at DESC) WHERE is_archived = false;
CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations (org_id, is_pinned) WHERE is_pinned = true;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_not_deleted ON conversations (org_id, status, last_message_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS search_vector tsvector;
UPDATE conversations SET search_vector = to_tsvector('simple', coalesce(customer_name,'') || ' ' || coalesce(customer_phone,'') || ' ' || coalesce(last_message,'')) WHERE search_vector IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_search_vector ON conversations USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_conversations_phone_trgm ON conversations USING gin(customer_phone gin_trgm_ops);

CREATE OR REPLACE FUNCTION conversations_search_vector_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_vector := to_tsvector('simple', coalesce(NEW.customer_name,'') || ' ' || coalesce(NEW.customer_phone,'') || ' ' || coalesce(NEW.last_message,''));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_conversations_search_vector ON conversations;
CREATE TRIGGER trg_conversations_search_vector BEFORE INSERT OR UPDATE OF customer_name, customer_phone, last_message ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_search_vector_update();

CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled ON campaigns (org_id, status, scheduled_at) WHERE status IN ('draft','scheduled','running');
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status ON campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_pending ON campaign_recipients (campaign_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_customers_search_trgm ON customers USING gin((coalesce(name,'') || ' ' || coalesce(phone,'')) gin_trgm_ops);
