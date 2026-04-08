
-- Remove duplicate policies (the SELECT-specific ones already cover supervisors)
DROP POLICY IF EXISTS "Supervisors can view employee shifts" ON public.employee_shifts;
DROP POLICY IF EXISTS "Supervisors can view team attendance" ON public.attendance_logs;
