import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "EXTERNAL_SUPABASE_DB_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use postgres connection to run DDL
  const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
  const sql = postgres(dbUrl, { ssl: "prefer" });

  const results: string[] = [];

  try {
    // Add dedicated_agent_id column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'dedicated_agent_id'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN dedicated_agent_id uuid REFERENCES public.profiles(id);
        END IF;
      END $$;
    `;
    results.push("dedicated_agent_id: ensured");

    // Add dedicated_agent_name column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'dedicated_agent_name'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN dedicated_agent_name text;
        END IF;
      END $$;
    `;
    results.push("dedicated_agent_name: ensured");

    // Add sentiment column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'sentiment'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN sentiment text;
        END IF;
      END $$;
    `;
    results.push("sentiment: ensured");

    // Add sentiment_score column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'sentiment_score'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN sentiment_score numeric;
        END IF;
      END $$;
    `;
    results.push("sentiment_score: ensured");

    // Add sentiment_updated_at column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'sentiment_updated_at'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN sentiment_updated_at timestamptz;
        END IF;
      END $$;
    `;
    results.push("sentiment_updated_at: ensured");

    // Add satisfaction_status column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'satisfaction_status'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN satisfaction_status text;
        END IF;
      END $$;
    `;
    results.push("satisfaction_status: ensured");

    // Add wa_conversation_id column if missing
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'wa_conversation_id'
        ) THEN
          ALTER TABLE public.conversations ADD COLUMN wa_conversation_id text;
        END IF;
      END $$;
    `;
    results.push("wa_conversation_id: ensured");

    // Verify current columns
    const cols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'conversations'
      ORDER BY ordinal_position;
    `;

    await sql.end();

    return new Response(JSON.stringify({
      success: true,
      results,
      current_columns: cols.map((c: any) => `${c.column_name} (${c.data_type})`),
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await sql.end();
    return new Response(JSON.stringify({ error: (e as Error).message, stack: (e as Error).stack }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
