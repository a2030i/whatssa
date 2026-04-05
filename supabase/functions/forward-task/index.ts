import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, task_id, config_id, org_id, task_data } = await req.json();

    if (action === "forward_to_whatsapp") {
      // Get forward config
      const { data: config } = await supabase
        .from("forward_configs")
        .select("*")
        .eq("id", config_id)
        .eq("org_id", org_id)
        .single();

      if (!config) {
        return new Response(JSON.stringify({ error: "Forward config not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Build message from template
      let message = config.message_template || "";
      const vars: Record<string, string> = {
        order_number: task_data?.order_number || "غير محدد",
        customer_name: task_data?.customer_name || "غير محدد",
        customer_phone: task_data?.customer_phone || "غير محدد",
        note: task_data?.note || task_data?.description || "",
      };
      for (const [key, val] of Object.entries(vars)) {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
      }

      // Determine channel to send through
      const { data: channels } = await supabase
        .from("whatsapp_config")
        .select("id, channel_type, phone_number_id, business_account_id, evolution_instance_name")
        .eq("org_id", org_id)
        .eq("is_connected", true)
        .limit(5);

      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ error: "No connected channels" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Prefer evolution for groups, meta for direct
      const targetPhone = config.target_phone || config.target_group_jid;
      const evolutionChannel = channels.find((c: any) => c.channel_type === "evolution");
      const metaChannel = channels.find((c: any) => c.channel_type === "meta_api");

      let sendResult;

      if (config.forward_type === "whatsapp_group" && evolutionChannel) {
        // Send via Evolution API to group
        const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
        const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

        if (evolutionUrl && evolutionKey) {
          const resp = await fetch(
            `${evolutionUrl}/message/sendText/${evolutionChannel.evolution_instance_name}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: evolutionKey,
              },
              body: JSON.stringify({
                number: targetPhone,
                text: message,
              }),
            }
          );
          sendResult = await resp.json();
        }
      } else if (metaChannel && config.forward_type === "whatsapp_direct") {
        // Send via Meta API
        const resp = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            org_id,
            to: targetPhone,
            type: "text",
            content: message,
          }),
        });
        sendResult = await resp.json();
      }

      // Update task status
      if (task_id) {
        await supabase.from("tasks").update({
          status: "forwarded",
          forward_status: "sent",
          forward_target: config.name,
        }).eq("id", task_id);
      }

      return new Response(JSON.stringify({ success: true, result: sendResult }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "forward_to_email") {
      // For email forwarding - placeholder for Resend integration
      const { data: config } = await supabase
        .from("forward_configs")
        .select("*")
        .eq("id", config_id)
        .eq("org_id", org_id)
        .single();

      if (!config || !config.target_email) {
        return new Response(JSON.stringify({ error: "Email config not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let message = config.message_template || "";
      const vars: Record<string, string> = {
        order_number: task_data?.order_number || "غير محدد",
        customer_name: task_data?.customer_name || "غير محدد",
        customer_phone: task_data?.customer_phone || "غير محدد",
        note: task_data?.note || task_data?.description || "",
      };
      for (const [key, val] of Object.entries(vars)) {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
      }

      // Update task
      if (task_id) {
        await supabase.from("tasks").update({
          status: "forwarded",
          forward_status: "email_queued",
          forward_target: config.target_email,
        }).eq("id", task_id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Email forwarding configured. Connect Resend for live emails.",
        email: config.target_email,
        body: message,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: create task from chatbot
    if (action === "create_from_bot") {
      const { error } = await supabase.from("tasks").insert({
        org_id,
        title: task_data.title || "مهمة من الشات بوت",
        description: task_data.description,
        task_type: task_data.task_type || "modification",
        priority: task_data.priority || "medium",
        customer_phone: task_data.customer_phone,
        customer_name: task_data.customer_name,
        conversation_id: task_data.conversation_id,
        created_by_type: "bot",
        source_data: task_data.source_data || {},
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-forward if config exists
      if (task_data.auto_forward_config_id) {
        // Trigger forward asynchronously
        await fetch(`${supabaseUrl}/functions/v1/forward-task`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            action: task_data.forward_type === "email" ? "forward_to_email" : "forward_to_whatsapp",
            config_id: task_data.auto_forward_config_id,
            org_id,
            task_data,
          }),
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("forward-task error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
