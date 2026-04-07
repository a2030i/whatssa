
-- Add scheduling columns to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS attendance_type text NOT NULL DEFAULT 'remote',
  ADD COLUMN IF NOT EXISTS task_date date,
  ADD COLUMN IF NOT EXISTS start_time time WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS end_time time WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS location text;

-- Create a trigger function to prevent overlapping tasks for the same employee
CREATE OR REPLACE FUNCTION public.check_task_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check if assigned_to, task_date, start_time, end_time are all set
  IF NEW.assigned_to IS NOT NULL 
     AND NEW.task_date IS NOT NULL 
     AND NEW.start_time IS NOT NULL 
     AND NEW.end_time IS NOT NULL 
     AND NEW.status NOT IN ('completed', 'cancelled') THEN
    
    IF EXISTS (
      SELECT 1 FROM public.tasks
      WHERE assigned_to = NEW.assigned_to
        AND task_date = NEW.task_date
        AND status NOT IN ('completed', 'cancelled')
        AND id IS DISTINCT FROM NEW.id
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
    ) THEN
      RAISE EXCEPTION 'TASK_OVERLAP: هذا الموظف لديه مهمة متداخلة في نفس الوقت';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_check_task_overlap ON public.tasks;
CREATE TRIGGER trg_check_task_overlap
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_overlap();
