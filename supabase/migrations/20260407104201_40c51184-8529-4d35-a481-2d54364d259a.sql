
CREATE OR REPLACE FUNCTION public.check_task_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
