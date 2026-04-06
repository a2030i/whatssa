import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Create email_configs table if not exists on external DB
    const { error } = await admin.rpc("exec_sql", {
      query: ""
    }).maybeSingle();

    // Use raw SQL via postgrest - but we can't exec arbitrary SQL via SDK
    // Instead, use the REST API directly
    const dbUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    
    const sqlResponse = await fetch(`${dbUrl}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
      },
    });

    // Try to select from email_configs to see if it exists
    const { data, error: selectError } = await admin
      .from("email_configs")
      .select("id")
      .limit(1);

    if (selectError && selectError.message.includes("does not exist")) {
      // Table doesn't exist — need to create it via SQL
      // We'll use the Supabase Management API or direct pg connection
      // For now, return the SQL the user needs to run
      return new Response(JSON.stringify({
        exists: false,
        message: "Table email_configs does not exist on external DB",
        sql: `
CREATE TABLE IF NOT EXISTS public.email_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  email_address text NOT NULL,
  smtp_host text NOT NULL DEFAULT '',
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_username text NOT NULL,
  smtp_password text NOT NULL,
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

CREATE POLICY "Users can manage own org email configs"
  ON public.email_configs FOR ALL
  TO authenticated
  USING (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()));
        `.trim()
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ exists: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
