CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(coalesce(input, ''), '\D', '', 'g')
$$;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.messages m
SET conversation_id = d.keep_id
FROM dupes d
WHERE m.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.ai_pending_questions t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.ai_reply_feedback t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.automation_logs t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.bot_analytics t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.chatbot_sessions t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.email_message_details t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.employee_group_access t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.flow_submissions t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.follow_up_reminders t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.internal_notes t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.message_retry_queue t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.satisfaction_ratings t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.scheduled_messages t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.tasks t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

WITH ranked AS (
  SELECT
    id,
    org_id,
    channel_id,
    conversation_type,
    public.normalize_phone(customer_phone) AS normalized_phone,
    COALESCE(updated_at, last_message_at, created_at, now()) AS sort_ts,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
      ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
    ) AS keep_id
  FROM public.conversations
  WHERE conversation_type = 'private'
    AND public.normalize_phone(customer_phone) <> ''
), dupes AS (
  SELECT id AS duplicate_id, keep_id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.tickets t
SET conversation_id = d.keep_id
FROM dupes d
WHERE t.conversation_id = d.duplicate_id;

DELETE FROM public.conversations c
USING (
  WITH ranked AS (
    SELECT
      id,
      org_id,
      channel_id,
      conversation_type,
      public.normalize_phone(customer_phone) AS normalized_phone,
      ROW_NUMBER() OVER (
        PARTITION BY org_id, channel_id, conversation_type, public.normalize_phone(customer_phone)
        ORDER BY COALESCE(updated_at, last_message_at, created_at, now()) DESC, id DESC
      ) AS rn
    FROM public.conversations
    WHERE conversation_type = 'private'
      AND public.normalize_phone(customer_phone) <> ''
  )
  SELECT id
  FROM ranked
  WHERE rn > 1
) d
WHERE c.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_private_identity_unique_idx
ON public.conversations (
  org_id,
  channel_id,
  conversation_type,
  public.normalize_phone(customer_phone)
)
WHERE conversation_type = 'private'
  AND public.normalize_phone(customer_phone) <> '';
