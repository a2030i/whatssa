
CREATE OR REPLACE FUNCTION public.count_org_messages(
  _org_id uuid,
  _from timestamptz,
  _sender text DEFAULT NULL,
  _status text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.org_id = _org_id
    AND m.created_at >= _from
    AND (_sender IS NULL OR m.sender = _sender)
    AND (_status IS NULL OR m.status = _status)
$$;
