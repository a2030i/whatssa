CREATE OR REPLACE FUNCTION public.increment_unread(conv_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE conversations SET unread_count = COALESCE(unread_count, 0) + 1 WHERE id = conv_id;
$$;