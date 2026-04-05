CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  free_plan_id UUID;
  is_invited boolean;
BEGIN
  -- Check if user was created via invite (has must_change_password flag)
  is_invited := COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false);
  
  IF is_invited THEN
    -- Invited user: create profile only, no org, no admin role
    -- The invite-member edge function handles org_id and role assignment
    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (
      NEW.id,
      NULL,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );
  ELSE
    -- Self-signup user: create org + profile + admin role
    SELECT id INTO free_plan_id FROM public.plans WHERE price = 0 AND is_active = true LIMIT 1;
    
    INSERT INTO public.organizations (name, plan_id, subscription_status)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || ' - Organization',
      free_plan_id,
      'trial'
    )
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (id, org_id, full_name)
    VALUES (
      NEW.id,
      new_org_id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$function$;