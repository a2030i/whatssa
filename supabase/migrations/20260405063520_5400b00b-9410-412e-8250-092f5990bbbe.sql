
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop and recreate the safe view with correct columns
DROP VIEW IF EXISTS public.whatsapp_config_safe;

CREATE VIEW public.whatsapp_config_safe
WITH (security_invoker = on)
AS
  SELECT id, org_id, phone_number_id, business_account_id, display_phone, business_name,
         is_connected, created_at, updated_at, channel_type, evolution_instance_name,
         evolution_instance_status, default_team_id, default_agent_id, channel_label,
         quality_rating, messaging_limit_tier, account_mode, health_status,
         rate_limit_settings, welcome_message_enabled, welcome_message_text,
         welcome_message_new_only, exclude_supervisors, onboarding_type, settings,
         CASE WHEN access_token IS NOT NULL THEN '••••••' ELSE NULL END as access_token_masked,
         CASE WHEN webhook_verify_token IS NOT NULL THEN '••••••' ELSE NULL END as webhook_verify_token_masked
  FROM public.whatsapp_config;

-- Security triggers for profile/role changes
CREATE OR REPLACE FUNCTION public.fn_log_security_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'profiles' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    INSERT INTO public.security_events (event_type, severity, actor_id, org_id, metadata)
    VALUES ('profile.org_change', 'critical', auth.uid(), OLD.org_id,
      jsonb_build_object('old_org', OLD.org_id, 'new_org', NEW.org_id, 'profile_id', NEW.id));
  END IF;
  IF TG_TABLE_NAME = 'profiles' AND OLD.is_supervisor IS DISTINCT FROM NEW.is_supervisor THEN
    INSERT INTO public.security_events (event_type, severity, actor_id, org_id, metadata)
    VALUES ('profile.supervisor_change', 'warning', auth.uid(), NEW.org_id,
      jsonb_build_object('profile_id', NEW.id, 'is_supervisor', NEW.is_supervisor));
  END IF;
  IF TG_TABLE_NAME = 'user_roles' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.security_events (event_type, severity, actor_id, org_id, metadata)
      VALUES ('role.granted', 'warning', auth.uid(), 
        (SELECT org_id FROM profiles WHERE id = NEW.user_id),
        jsonb_build_object('target_user', NEW.user_id, 'role', NEW.role));
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.security_events (event_type, severity, actor_id, org_id, metadata)
      VALUES ('role.revoked', 'warning', auth.uid(),
        (SELECT org_id FROM profiles WHERE id = OLD.user_id),
        jsonb_build_object('target_user', OLD.user_id, 'role', OLD.role));
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_security_profile_changes ON public.profiles;
CREATE TRIGGER trg_security_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id OR OLD.is_supervisor IS DISTINCT FROM NEW.is_supervisor)
  EXECUTE FUNCTION public.fn_log_security_event();

DROP TRIGGER IF EXISTS trg_security_role_changes ON public.user_roles;
CREATE TRIGGER trg_security_role_changes
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_security_event();

-- Prevent org_id tampering on critical tables
CREATE OR REPLACE FUNCTION public.fn_prevent_org_tampering()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'org_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_conversations ON public.conversations;
CREATE TRIGGER trg_prevent_org_tamper_conversations BEFORE UPDATE ON public.conversations
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_customers ON public.customers;
CREATE TRIGGER trg_prevent_org_tamper_customers BEFORE UPDATE ON public.customers
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_orders ON public.orders;
CREATE TRIGGER trg_prevent_org_tamper_orders BEFORE UPDATE ON public.orders
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_campaigns ON public.campaigns;
CREATE TRIGGER trg_prevent_org_tamper_campaigns BEFORE UPDATE ON public.campaigns
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_whatsapp_config ON public.whatsapp_config;
CREATE TRIGGER trg_prevent_org_tamper_whatsapp_config BEFORE UPDATE ON public.whatsapp_config
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();

DROP TRIGGER IF EXISTS trg_prevent_org_tamper_api_tokens ON public.api_tokens;
CREATE TRIGGER trg_prevent_org_tamper_api_tokens BEFORE UPDATE ON public.api_tokens
  FOR EACH ROW WHEN (OLD.org_id IS DISTINCT FROM NEW.org_id)
  EXECUTE FUNCTION public.fn_prevent_org_tampering();
