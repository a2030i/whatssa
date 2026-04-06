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

    // Use the Supabase Management/PostgREST won't work for DDL,
    // so we use the pg REST endpoint for SQL execution
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    
    // Connect to external DB via its REST SQL endpoint
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

    // Execute via the external Supabase SQL endpoint (requires service role)
    const response = await fetch(`${url}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
    });

    // Since we can't run DDL via PostgREST, we'll use the pg protocol
    // through the Supabase SQL API (available at /pg endpoint for service role)
    const sqlResponse = await fetch(`${url}/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sqlStatements }),
    });

    if (!sqlResponse.ok) {
      const errorText = await sqlResponse.text();
      // If /sql endpoint is not available, try alternative approach
      throw new Error(`SQL endpoint returned ${sqlResponse.status}: ${errorText}`);
    }

    const result = await sqlResponse.json();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
