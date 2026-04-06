import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role client to create the table via rpc if available,
    // otherwise try the SQL HTTP API
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Step 1: Check if table already exists by trying to query it
    const { error: checkError } = await admin
      .from("email_configs")
      .select("id")
      .limit(1);

    if (!checkError) {
      return new Response(JSON.stringify({ success: true, message: "Table already exists" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: If table doesn't exist, try the Supabase SQL HTTP endpoint
    // Available at POST /pg/query for projects with the SQL API enabled
    const endpoints = [
      `${url}/sql`,
      `${url}/pg/query`,
    ];

    const sqlStatements = `
      CREATE TABLE IF NOT EXISTS public.email_configs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES public.organizations(id),
        email_address text NOT NULL,
        smtp_host text NOT NULL DEFAULT '',
        smtp_port integer NOT NULL DEFAULT 587,
        smtp_username text NOT NULL DEFAULT '',
        smtp_password text NOT NULL DEFAULT '',
        encryption text NOT NULL DEFAULT 'tls',
        imap_host text,
        imap_port integer,
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

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = 'email_configs' AND policyname = 'Users can manage own org email configs'
        ) THEN
          CREATE POLICY "Users can manage own org email configs"
            ON public.email_configs FOR ALL TO authenticated
            USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
            WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
        END IF;
      END $$;
    `;

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
          body: JSON.stringify({ query: sqlStatements }),
        });

        if (resp.ok) {
          const result = await resp.json();
          return new Response(JSON.stringify({ success: true, endpoint, result }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        lastError = `${endpoint}: ${resp.status} - ${await resp.text()}`;
      } catch (e: any) {
        lastError = `${endpoint}: ${e.message}`;
      }
    }

    return new Response(JSON.stringify({ 
      error: "Could not execute DDL via SQL API", 
      details: lastError,
      hint: "Please run the CREATE TABLE SQL manually in your Supabase SQL Editor"
    }), {
      status: 422,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
