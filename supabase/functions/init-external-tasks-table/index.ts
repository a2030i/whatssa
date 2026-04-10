import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
    if (!dbUrl) return json({ error: "EXTERNAL_SUPABASE_DB_URL not set" }, 500);

    // Use pg to connect directly for DDL
    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

    // 1. Create tasks table
    await sql`
      CREATE TABLE IF NOT EXISTS public.tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        conversation_id uuid REFERENCES public.conversations(id),
        customer_phone text,
        customer_name text,
        title text NOT NULL,
        description text,
        task_type text NOT NULL DEFAULT 'general',
        status text NOT NULL DEFAULT 'pending',
        priority text NOT NULL DEFAULT 'medium',
        assigned_to uuid REFERENCES public.profiles(id),
        created_by_type text NOT NULL DEFAULT 'agent',
        source_data jsonb DEFAULT '{}'::jsonb,
        forward_target text,
        forward_status text,
        completed_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        created_by uuid,
        attendance_type text DEFAULT 'remote',
        task_date date,
        start_time time,
        end_time time,
        location text
      )
    `;

    // 2. Enable RLS
    await sql`ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY`;

    // 3. Create check_task_overlap function
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION public.check_task_overlap()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
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
      $$
    `);

    // 4. Create trigger
    await sql.unsafe(`
      DROP TRIGGER IF EXISTS trg_check_task_overlap ON public.tasks;
      CREATE TRIGGER trg_check_task_overlap
        BEFORE INSERT OR UPDATE ON public.tasks
        FOR EACH ROW EXECUTE FUNCTION public.check_task_overlap()
    `);

    // 5. Create can_access_task function
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION public.can_access_task(_user_id uuid, _task_org_id uuid, _task_assigned_to uuid, _task_created_by uuid)
      RETURNS boolean
      LANGUAGE plpgsql
      STABLE SECURITY DEFINER
      SET search_path TO 'public'
      AS $$
      DECLARE
        _profile record;
        _is_admin boolean;
      BEGIN
        SELECT org_id, team_id, is_supervisor INTO _profile
        FROM public.profiles WHERE id = _user_id;
        IF _profile.org_id IS DISTINCT FROM _task_org_id THEN RETURN false; END IF;
        _is_admin := public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'super_admin');
        IF _is_admin THEN RETURN true; END IF;
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
        RETURN _task_assigned_to = _user_id OR _task_created_by = _user_id;
      END;
      $$
    `);

    // 6. RLS policies
    await sql.unsafe(`
      DROP POLICY IF EXISTS "tasks_select_policy" ON public.tasks;
      CREATE POLICY "tasks_select_policy" ON public.tasks
        FOR SELECT TO authenticated
        USING (public.can_access_task(auth.uid(), org_id, assigned_to, created_by));

      DROP POLICY IF EXISTS "tasks_insert_policy" ON public.tasks;
      CREATE POLICY "tasks_insert_policy" ON public.tasks
        FOR INSERT TO authenticated
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "tasks_update_policy" ON public.tasks;
      CREATE POLICY "tasks_update_policy" ON public.tasks
        FOR UPDATE TO authenticated
        USING (public.can_access_task(auth.uid(), org_id, assigned_to, created_by));

      DROP POLICY IF EXISTS "tasks_service_role" ON public.tasks;
      CREATE POLICY "tasks_service_role" ON public.tasks
        FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    `);

    // 7. Updated_at trigger
    await sql.unsafe(`
      DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
      CREATE TRIGGER trg_tasks_updated_at
        BEFORE UPDATE ON public.tasks
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()
    `);

    // 8. Indexes
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_tasks_org_id ON public.tasks(org_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tasks_task_date ON public.tasks(task_date);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status)
    `);

    await sql.end();

    return json({ success: true, message: "Tasks table created in external DB" });
  } catch (err) {
    console.error("Init external tasks error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
