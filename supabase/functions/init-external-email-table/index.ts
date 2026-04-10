import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
    const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check if email_configs exists
    const { error: checkError } = await admin
      .from("email_configs")
      .select("id")
      .limit(1);

    // Check if email_message_details exists
    const { error: detailsCheckError } = await admin
      .from("email_message_details")
      .select("id")
      .limit(1);

    const tablesCreated: string[] = [];

    const sqlStatements = [];

    if (checkError) {
      sqlStatements.push(`
        CREATE TABLE IF NOT EXISTS public.email_configs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id uuid NOT NULL REFERENCES public.organizations(id),
          email_address text NOT NULL,
          smtp_host text NOT NULL DEFAULT 'smtp.gmail.com',
          smtp_port integer NOT NULL DEFAULT 465,
          smtp_username text NOT NULL DEFAULT '',
          smtp_password text NOT NULL DEFAULT '',
          encryption text NOT NULL DEFAULT 'ssl',
          imap_host text DEFAULT 'imap.gmail.com',
          imap_port integer DEFAULT 993,
          is_active boolean NOT NULL DEFAULT true,
          is_verified boolean NOT NULL DEFAULT false,
          sync_mode text NOT NULL DEFAULT 'new_only',
          label text,
          dedicated_agent_id uuid REFERENCES public.profiles(id),
          dedicated_team_id uuid REFERENCES public.teams(id),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;
      `);
      tablesCreated.push("email_configs");
    }

    if (detailsCheckError) {
      sqlStatements.push(`
        CREATE TABLE IF NOT EXISTS public.email_message_details (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
          conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
          org_id uuid NOT NULL REFERENCES public.organizations(id),
          email_subject text,
          email_from text,
          email_from_name text,
          email_to text,
          email_cc text,
          email_bcc text,
          email_message_id text,
          email_in_reply_to text,
          email_references text,
          email_attachments jsonb DEFAULT '[]'::jsonb,
          sent_by uuid,
          sent_by_name text,
          direction text NOT NULL DEFAULT 'inbound',
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_email_details_message_id ON public.email_message_details(message_id);
        CREATE INDEX IF NOT EXISTS idx_email_details_conversation_id ON public.email_message_details(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_email_details_org_id ON public.email_message_details(org_id);
        CREATE INDEX IF NOT EXISTS idx_email_details_email_message_id ON public.email_message_details(email_message_id);

        ALTER TABLE public.email_message_details ENABLE ROW LEVEL SECURITY;

        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'email_message_details' AND policyname = 'Org members see own email details'
          ) THEN
            CREATE POLICY "Org members see own email details"
              ON public.email_message_details FOR SELECT TO authenticated
              USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
          END IF;
        END $$;

        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'email_message_details' AND policyname = 'Org members insert email details'
          ) THEN
            CREATE POLICY "Org members insert email details"
              ON public.email_message_details FOR INSERT TO authenticated
              WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
          END IF;
        END $$;

        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE tablename = 'email_message_details' AND policyname = 'Service role full access email details'
          ) THEN
            CREATE POLICY "Service role full access email details"
              ON public.email_message_details FOR ALL TO service_role
              USING (true) WITH CHECK (true);
          END IF;
        END $$;
      `);
      tablesCreated.push("email_message_details");
    }

    if (sqlStatements.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "All tables already exist" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullSql = sqlStatements.join("\n");

    // Try DB URL first (direct connection)
    if (dbUrl) {
      try {
        const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
        const pgClient = new Client(dbUrl);
        await pgClient.connect();
        await pgClient.queryArray(fullSql);
        await pgClient.end();
        return new Response(JSON.stringify({ success: true, method: "direct_db", tables_created: tablesCreated }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e: any) {
        console.warn("[init-email-table] Direct DB failed, trying HTTP:", (e as Error).message);
      }
    }

    // Fallback: SQL HTTP API
    const endpoints = [`${url}/sql`, `${url}/pg/query`];
    let lastError = "";
    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
            "apikey": serviceKey,
          },
          body: JSON.stringify({ query: fullSql }),
        });
        if (resp.ok) {
          return new Response(JSON.stringify({ success: true, method: "http_sql", endpoint, tables_created: tablesCreated }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `${endpoint}: ${resp.status} - ${await resp.text()}`;
      } catch (e: any) {
        lastError = `${endpoint}: ${(e as Error).message}`;
      }
    }

    return new Response(JSON.stringify({
      error: "Could not execute DDL",
      details: lastError,
      hint: "Please run the CREATE TABLE SQL manually in your external database SQL editor",
      sql: fullSql,
    }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
