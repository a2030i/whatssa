DROP FUNCTION IF EXISTS public.get_org_whatsapp_channels();

CREATE FUNCTION public.get_org_whatsapp_channels()
RETURNS SETOF whatsapp_config
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wc.*
  FROM whatsapp_config wc
  WHERE wc.org_id = (
    SELECT p.org_id FROM profiles p WHERE p.id = auth.uid()
  );
$$;