
-- 1. Shift templates table
CREATE TABLE public.shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  work_days INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4}',
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org shifts" ON public.shift_templates
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage shifts" ON public.shift_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 2. Employee shift assignments
CREATE TABLE public.employee_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES public.shift_templates(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, shift_id, effective_from)
);

ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org employee shifts" ON public.employee_shifts
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage employee shifts" ON public.employee_shifts
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 3. Attendance log (clock in/out)
CREATE TABLE public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  shift_id UUID REFERENCES public.shift_templates(id),
  note TEXT,
  classification TEXT CHECK (classification IN ('on_time', 'late', 'early_leave', 'overtime', NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attendance" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))));

CREATE POLICY "Users can insert their own attendance" ON public.attendance_logs
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() AND org_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can manage attendance" ON public.attendance_logs
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 4. Employee group access (specific group conversations an employee can see)
CREATE TABLE public.employee_group_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, conversation_id)
);

ALTER TABLE public.employee_group_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their own group access" ON public.employee_group_access
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))));

CREATE POLICY "Admins can manage group access" ON public.employee_group_access
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- Add supervisor policy for employee_shifts viewing
CREATE POLICY "Supervisors can view employee shifts" ON public.employee_shifts
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Add supervisor policy for attendance viewing  
CREATE POLICY "Supervisors can view team attendance" ON public.attendance_logs
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));
