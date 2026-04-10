import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(extUrl, extKey);

    // Verify webhook token
    const { data: webhook, error: whErr } = await supabase
      .from("zapier_webhooks")
      .select("*")
      .eq("webhook_token", token)
      .eq("is_active", true)
      .maybeSingle();

    if (whErr || !webhook) {
      return new Response(JSON.stringify({ error: "Invalid or inactive webhook" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action || "create_customer";
    const orgId = webhook.org_id;

    // Check if action is allowed
    if (!webhook.allowed_actions?.includes(action)) {
      return new Response(JSON.stringify({ error: `Action '${action}' not allowed` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any = null;

    switch (action) {
      case "create_customer": {
        const { phone, name, email, tags, company } = body;
        if (!phone) {
          return new Response(JSON.stringify({ error: "phone is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabase
          .from("customers")
          .upsert(
            { org_id: orgId, phone, name: name || null, email: email || null, tags: tags || null, company: company || null, source: "zapier" },
            { onConflict: "org_id,phone" }
          )
          .select()
          .single();
        if (error) throw error;
        result = data;
        break;
      }

      case "send_message": {
        const { phone, message, channel_id } = body;
        if (!phone || !message) {
          return new Response(JSON.stringify({ error: "phone and message are required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Find or create conversation
        let { data: conv } = await supabase
          .from("conversations")
          .select("id, channel_id")
          .eq("org_id", orgId)
          .eq("customer_phone", phone)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const sendChannelId = channel_id || conv?.channel_id;
        if (!sendChannelId) {
          return new Response(JSON.stringify({ error: "No active conversation or channel_id found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Insert message
        const { data: msg, error: msgErr } = await supabase.from("messages").insert({
          conversation_id: conv?.id,
          sender: "agent",
          content: message,
          status: "pending",
        }).select().single();

        if (msgErr) throw msgErr;
        result = { message_id: msg?.id, conversation_id: conv?.id };
        break;
      }

      case "create_conversation": {
        const { phone, name, initial_message } = body;
        if (!phone) {
          return new Response(JSON.stringify({ error: "phone is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data: conv, error: convErr } = await supabase
          .from("conversations")
          .insert({
            org_id: orgId,
            customer_phone: phone,
            customer_name: name || null,
            status: "active",
            last_message: initial_message || null,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (convErr) throw convErr;
        result = conv;
        break;
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Update trigger stats
    await supabase
      .from("zapier_webhooks")
      .update({
        trigger_count: (webhook.trigger_count || 0) + 1,
        last_triggered_at: new Date().toISOString(),
      })
      .eq("id", webhook.id);

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Zapier incoming error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
