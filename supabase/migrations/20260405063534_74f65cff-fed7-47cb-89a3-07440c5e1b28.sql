
CREATE OR REPLACE FUNCTION public.fn_prevent_org_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'org_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
