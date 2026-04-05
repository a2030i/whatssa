DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_system_settings_select' AND tablename = 'system_settings') THEN
    CREATE POLICY "allow_all_system_settings_select" ON public.system_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_system_settings_insert' AND tablename = 'system_settings') THEN
    CREATE POLICY "allow_all_system_settings_insert" ON public.system_settings FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'allow_all_system_settings_update' AND tablename = 'system_settings') THEN
    CREATE POLICY "allow_all_system_settings_update" ON public.system_settings FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
END $$;