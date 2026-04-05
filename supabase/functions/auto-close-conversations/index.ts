import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Get all orgs with auto-close enabled
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, settings")
      .eq("is_active", true);

    let totalClosed = 0;

    for (const org of (orgs || [])) {
      const settings = (org.settings as Record<string, any>) || {};
      const autoCloseHours = settings.auto_close_hours;
      
      if (!autoCloseHours || autoCloseHours <= 0) continue;

      const cutoff = new Date(Date.now() - autoCloseHours * 60 * 60 * 1000).toISOString();

      // Find conversations that have been inactive
      const { data: staleConvs } = await supabase
        .from("conversations")
        .select("id")
        .eq("org_id", org.id)
        .in("status", ["active", "waiting"])
        .lt("last_message_at", cutoff)
        .limit(100);

      if (!staleConvs || staleConvs.length === 0) continue;

      const ids = staleConvs.map((c: any) => c.id);

      await supabase
        .from("conversations")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: "system",
        })
        .in("id", ids);

      // Insert system messages
      const systemMsgs = ids.map((id: string) => ({
        conversation_id: id,
        content: `تم إغلاق المحادثة تلقائياً بعد ${autoCloseHours} ساعة من عدم النشاط`,
        sender: "system",
        message_type: "text",
      }));

      await supabase.from("messages").insert(systemMsgs);
      totalClosed += ids.length;
    }

    return new Response(JSON.stringify({ success: true, closed: totalClosed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Auto-close error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
