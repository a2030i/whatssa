
-- Add created_by column to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- Helper function: check if user can see a task based on role
CREATE OR REPLACE FUNCTION public.can_access_task(_user_id uuid, _task_org_id uuid, _task_assigned_to uuid, _task_created_by uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile record;
  _is_admin boolean;
BEGIN
  -- Get user profile
  SELECT org_id, team_id, is_supervisor INTO _profile
  FROM public.profiles WHERE id = _user_id;

  -- Must be same org
  IF _profile.org_id IS DISTINCT FROM _task_org_id THEN
    RETURN false;
  END IF;

  -- Admins see all
  _is_admin := public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin');
  IF _is_admin THEN
    RETURN true;
  END IF;

  -- Supervisors see their team's tasks
  IF _profile.is_supervisor AND _profile.team_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id IN (_task_assigned_to, _task_created_by)
        AND p.team_id = _profile.team_id
    )
    OR _task_assigned_to = _user_id
    OR _task_created_by = _user_id
    OR _task_assigned_to IS NULL;
  END IF;

  -- Members see only their own tasks
  RETURN _task_assigned_to = _user_id OR _task_created_by = _user_id;
END;
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view tasks in their org" ON public.tasks;
DROP POLICY IF EXISTS "Users can create tasks in their org" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks in their org" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete tasks in their org" ON public.tasks;

-- New role-based policies
CREATE POLICY "Role-based task access" ON public.tasks
FOR SELECT TO authenticated
USING (public.can_access_task(auth.uid(), org_id, assigned_to, created_by));

CREATE POLICY "Users can create tasks in their org" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Role-based task update" ON public.tasks
FOR UPDATE TO authenticated
USING (public.can_access_task(auth.uid(), org_id, assigned_to, created_by));

CREATE POLICY "Role-based task delete" ON public.tasks
FOR DELETE TO authenticated
USING (public.can_access_task(auth.uid(), org_id, assigned_to, created_by));
