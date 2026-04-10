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
    let dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
    if (!dbUrl) return json({ error: "EXTERNAL_SUPABASE_DB_URL not set" }, 500);

    // If using pooler, switch to direct connection for DDL
    if (dbUrl.includes("pooler.supabase.com")) {
      const match = dbUrl.match(/postgres\.([a-z]+):(.*?)@/);
      if (match) {
        const ref = match[1];
        const pass = match[2];
        dbUrl = `postgresql://postgres:${pass}@db.${ref}.supabase.co:5432/postgres`;
        console.log("Switched to direct connection:", `db.${ref}.supabase.co:5432`);
      }
    }

    // Log connection info (masked)
    try {
      const u = new URL(dbUrl);
      console.log("Connecting to:", u.hostname, "port:", u.port, "user:", u.username);
    } catch (e) {
      console.log("URL parse failed");
    }

    const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
    const sql = postgres(dbUrl, { ssl: "prefer" });

    const results: string[] = [];

    // ── 1. tickets ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.tickets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        conversation_id uuid REFERENCES public.conversations(id),
        customer_phone text,
        customer_name text,
        title text NOT NULL,
        description text,
        status text NOT NULL DEFAULT 'open',
        priority text NOT NULL DEFAULT 'medium',
        category text NOT NULL DEFAULT 'general',
        assigned_to uuid REFERENCES public.profiles(id),
        created_by uuid,
        closed_at timestamptz,
        closed_by uuid,
        message_ids text[] DEFAULT '{}',
        message_previews jsonb DEFAULT '[]',
        metadata jsonb DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "tickets_org_access" ON public.tickets;
      CREATE POLICY "tickets_org_access" ON public.tickets
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "tickets_service_role" ON public.tickets;
      CREATE POLICY "tickets_service_role" ON public.tickets
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_tickets_org_id ON public.tickets(org_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_conversation_id ON public.tickets(conversation_id);
      DROP TRIGGER IF EXISTS trg_tickets_updated_at ON public.tickets;
      CREATE TRIGGER trg_tickets_updated_at
        BEFORE UPDATE ON public.tickets
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    `);
    results.push("tickets ✅");

    // ── 2. internal_notes ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.internal_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        conversation_id uuid NOT NULL REFERENCES public.conversations(id),
        message_id uuid,
        author_id uuid NOT NULL,
        content text NOT NULL,
        mentioned_user_ids uuid[] DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "internal_notes_org_access" ON public.internal_notes;
      CREATE POLICY "internal_notes_org_access" ON public.internal_notes
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "internal_notes_service_role" ON public.internal_notes;
      CREATE POLICY "internal_notes_service_role" ON public.internal_notes
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation_id ON public.internal_notes(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_internal_notes_org_id ON public.internal_notes(org_id);
      DROP TRIGGER IF EXISTS trg_internal_notes_updated_at ON public.internal_notes;
      CREATE TRIGGER trg_internal_notes_updated_at
        BEFORE UPDATE ON public.internal_notes
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    `);
    results.push("internal_notes ✅");

    // ── 3. satisfaction_ratings ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.satisfaction_ratings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES public.conversations(id),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        agent_name text,
        rating integer NOT NULL,
        feedback_text text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.satisfaction_ratings ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "satisfaction_ratings_org_access" ON public.satisfaction_ratings;
      CREATE POLICY "satisfaction_ratings_org_access" ON public.satisfaction_ratings
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "satisfaction_ratings_service_role" ON public.satisfaction_ratings;
      CREATE POLICY "satisfaction_ratings_service_role" ON public.satisfaction_ratings
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_satisfaction_ratings_org_id ON public.satisfaction_ratings(org_id);
      CREATE INDEX IF NOT EXISTS idx_satisfaction_ratings_conversation_id ON public.satisfaction_ratings(conversation_id);
    `);
    results.push("satisfaction_ratings ✅");

    // ── 4. scheduled_messages ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.scheduled_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        conversation_id uuid REFERENCES public.conversations(id),
        to_phone text NOT NULL,
        message_type text NOT NULL DEFAULT 'text',
        content text,
        template_name text,
        template_language text DEFAULT 'ar',
        template_components jsonb DEFAULT '[]',
        scheduled_at timestamptz NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        sent_at timestamptz,
        error_message text,
        created_by uuid,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "scheduled_messages_org_access" ON public.scheduled_messages;
      CREATE POLICY "scheduled_messages_org_access" ON public.scheduled_messages
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "scheduled_messages_service_role" ON public.scheduled_messages;
      CREATE POLICY "scheduled_messages_service_role" ON public.scheduled_messages
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_org_id ON public.scheduled_messages(org_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON public.scheduled_messages(status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON public.scheduled_messages(scheduled_at);
      DROP TRIGGER IF EXISTS trg_scheduled_messages_updated_at ON public.scheduled_messages;
      CREATE TRIGGER trg_scheduled_messages_updated_at
        BEFORE UPDATE ON public.scheduled_messages
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    `);
    results.push("scheduled_messages ✅");

    // ── 5. follow_up_reminders ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        conversation_id uuid NOT NULL REFERENCES public.conversations(id),
        customer_phone text NOT NULL,
        customer_name text,
        created_by uuid NOT NULL,
        assigned_to uuid,
        scheduled_at timestamptz NOT NULL,
        reminder_note text,
        auto_send_message text,
        auto_send_template_name text,
        auto_send_template_language text DEFAULT 'ar',
        status text NOT NULL DEFAULT 'pending',
        sent_at timestamptz,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "follow_up_reminders_org_access" ON public.follow_up_reminders;
      CREATE POLICY "follow_up_reminders_org_access" ON public.follow_up_reminders
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "follow_up_reminders_service_role" ON public.follow_up_reminders;
      CREATE POLICY "follow_up_reminders_service_role" ON public.follow_up_reminders
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_org_id ON public.follow_up_reminders(org_id);
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_status ON public.follow_up_reminders(status);
      CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_scheduled_at ON public.follow_up_reminders(scheduled_at);
      DROP TRIGGER IF EXISTS trg_follow_up_reminders_updated_at ON public.follow_up_reminders;
      CREATE TRIGGER trg_follow_up_reminders_updated_at
        BEFORE UPDATE ON public.follow_up_reminders
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    `);
    results.push("follow_up_reminders ✅");

    // ── 6. closure_reasons ──
    await sql`
      CREATE TABLE IF NOT EXISTS public.closure_reasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        label text NOT NULL,
        sort_order integer DEFAULT 0,
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE public.closure_reasons ENABLE ROW LEVEL SECURITY`;
    await sql.unsafe(`
      DROP POLICY IF EXISTS "closure_reasons_org_access" ON public.closure_reasons;
      CREATE POLICY "closure_reasons_org_access" ON public.closure_reasons
        FOR ALL TO authenticated
        USING (org_id = public.get_user_org_id(auth.uid()))
        WITH CHECK (org_id = public.get_user_org_id(auth.uid()));

      DROP POLICY IF EXISTS "closure_reasons_service_role" ON public.closure_reasons;
      CREATE POLICY "closure_reasons_service_role" ON public.closure_reasons
        FOR ALL TO service_role
        USING (true) WITH CHECK (true);
    `);
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS idx_closure_reasons_org_id ON public.closure_reasons(org_id);
    `);
    results.push("closure_reasons ✅");

    await sql.end();

    return json({ success: true, tables: results });
  } catch (err) {
    console.error("Init external operational tables error:", err);
    return json({ error: (err as Error).message, stack: (err as Error).stack?.split("\n").slice(0, 3) }, 500);
  }
});
