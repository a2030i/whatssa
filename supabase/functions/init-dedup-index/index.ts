import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return new Response(JSON.stringify({ error: "Missing external DB credentials" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(extUrl, extKey);

    // Step 1: Create normalize_phone function if not exists
    const { error: fnErr } = await supabase.rpc("exec_sql", {
      sql: `
        CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
        RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
          SELECT regexp_replace(coalesce(input, ''), '\\D', '', 'g')
        $$;
      `
    });

    // If rpc doesn't exist, try direct REST approach — fallback to pg connection
    // Try via the Supabase DB URL directly
    const dbUrl = Deno.env.get("EXTERNAL_SUPABASE_DB_URL");
    if (dbUrl) {
      // Use postgres connection directly
      const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.4/mod.js");
      const sql = postgres(dbUrl, { ssl: "require" });

      try {
        // Create normalize_phone function
        await sql`
          CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
          RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
            SELECT regexp_replace(coalesce(input, ''), '\\D', '', 'g')
          $$
        `;
        console.log("✅ normalize_phone function created");

        // Deduplicate existing conversations before creating index
        // Keep the most recently updated conversation for each (org_id, channel_id, customer_phone) combo
        const deduped = await sql`
          WITH duplicates AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                     PARTITION BY org_id, channel_id, conversation_type, normalize_phone(customer_phone)
                     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                   ) AS rn
            FROM conversations
            WHERE conversation_type = 'private'
          ),
          to_delete AS (
            SELECT id FROM duplicates WHERE rn > 1
          )
          SELECT count(*) as cnt FROM to_delete
        `;
        const dupCount = deduped[0]?.cnt || 0;
        console.log(`Found ${dupCount} duplicate conversations to merge`);

        if (Number(dupCount) > 0) {
          // Move messages from duplicates to the primary conversation
          await sql`
            WITH duplicates AS (
              SELECT id, conversation_type, org_id, channel_id, customer_phone,
                     ROW_NUMBER() OVER (
                       PARTITION BY org_id, channel_id, conversation_type, normalize_phone(customer_phone)
                       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                     ) AS rn,
                     FIRST_VALUE(id) OVER (
                       PARTITION BY org_id, channel_id, conversation_type, normalize_phone(customer_phone)
                       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                     ) AS primary_id
              FROM conversations
              WHERE conversation_type = 'private'
            )
            UPDATE messages m
            SET conversation_id = d.primary_id
            FROM duplicates d
            WHERE m.conversation_id = d.id
              AND d.rn > 1
              AND d.primary_id != d.id
          `;
          console.log("✅ Messages migrated to primary conversations");

          // Delete duplicate conversations
          await sql`
            WITH duplicates AS (
              SELECT id,
                     ROW_NUMBER() OVER (
                       PARTITION BY org_id, channel_id, conversation_type, normalize_phone(customer_phone)
                       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                     ) AS rn
              FROM conversations
              WHERE conversation_type = 'private'
            )
            DELETE FROM conversations
            WHERE id IN (SELECT id FROM duplicates WHERE rn > 1)
          `;
          console.log("✅ Duplicate conversations deleted");
        }

        // Create unique index
        await sql`
          CREATE UNIQUE INDEX IF NOT EXISTS conversations_private_identity_unique_idx
          ON conversations (org_id, channel_id, normalize_phone(customer_phone))
          WHERE conversation_type = 'private'
        `;
        console.log("✅ Unique index created successfully");

        await sql.end();

        return new Response(JSON.stringify({
          success: true,
          duplicates_removed: Number(dupCount),
          message: "Unique index created on external DB"
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (pgErr) {
        await sql.end();
        console.error("PG Error:", pgErr);
        return new Response(JSON.stringify({
          error: pgErr instanceof Error ? pgErr.message : String(pgErr)
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({
      error: "EXTERNAL_SUPABASE_DB_URL not configured. Please add it as a secret."
    }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
