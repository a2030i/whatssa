
-- Re-grant SELECT on whatsapp_config to authenticated so that:
-- 1. The whatsapp_config_safe view (security_invoker=on) works for org admins
-- 2. RLS policies on whatsapp_config restrict access to admins of the same org
-- 3. The view excludes sensitive columns (access_token, webhook_verify_token)
GRANT SELECT ON public.whatsapp_config TO authenticated;
