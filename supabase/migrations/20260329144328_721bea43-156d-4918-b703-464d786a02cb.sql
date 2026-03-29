
ALTER TABLE public.profiles
ADD COLUMN work_start_2 time DEFAULT NULL,
ADD COLUMN work_end_2 time DEFAULT NULL,
ADD COLUMN work_days_2 integer[] DEFAULT NULL;

COMMENT ON COLUMN public.profiles.work_start_2 IS 'Second shift start time';
COMMENT ON COLUMN public.profiles.work_end_2 IS 'Second shift end time';
COMMENT ON COLUMN public.profiles.work_days_2 IS 'Second shift work days';
