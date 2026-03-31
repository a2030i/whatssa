
-- Fix: Make the view use SECURITY INVOKER instead of SECURITY DEFINER
ALTER VIEW public.whatsapp_config_safe SET (security_invoker = on);
