import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const ext = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get all email conversation IDs
    const { data: emailConvs, error: convErr } = await ext
      .from("conversations")
      .select("id")
      .eq("conversation_type", "email");

    if (convErr) throw convErr;

    const convIds = (emailConvs || []).map((c: any) => c.id);

    let deletedMsgs = 0;
    let deletedConvs = 0;

    if (convIds.length > 0) {
      // Delete messages first (batch by conv)
      for (const cid of convIds) {
        const { error: delMsgErr } = await ext
          .from("messages")
          .delete()
          .eq("conversation_id", cid);
        if (!delMsgErr) deletedMsgs++;
      }

      // Delete conversations
      for (const cid of convIds) {
        const { error: delConvErr } = await ext
          .from("conversations")
          .delete()
          .eq("id", cid);
        if (!delConvErr) deletedConvs++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deleted_messages: deletedMsgs,
      deleted_conversations: deletedConvs,
      total_email_convs_found: convIds.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
