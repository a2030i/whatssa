
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS unread_mention_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_mention_count(conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE conversations SET unread_mention_count = COALESCE(unread_mention_count, 0) + 1 WHERE id = conv_id;
$$;
