import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Internal function URL for sending messages
  const internalUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const now = new Date().toISOString();

    // Get due follow-ups
    const { data: dueReminders } = await supabase
      .from("follow_up_reminders")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(50);

    if (!dueReminders || dueReminders.length === 0) {
      return json({ processed: 0, message: "No due follow-ups" });
    }

    let notified = 0;
    let autoSent = 0;

    for (const reminder of dueReminders) {
      try {
        // 1. Always create notification for the assigned agent
        if (reminder.assigned_to) {
          await supabase.from("notifications").insert({
            org_id: reminder.org_id,
            user_id: reminder.assigned_to,
            type: "follow_up",
            title: "⏰ تذكير متابعة",
            body: `حان موعد متابعة ${reminder.customer_name || reminder.customer_phone}${reminder.reminder_note ? ` — ${reminder.reminder_note}` : ""}`,
            reference_type: "conversation",
            reference_id: reminder.conversation_id,
          });
          notified++;
        }

        // 2. Auto-send message if configured
        if (reminder.auto_send_message) {
          // Determine channel type from conversation
          const { data: conv } = await supabase
            .from("conversations")
            .select("channel_id, status")
            .eq("id", reminder.conversation_id)
            .maybeSingle();

          if (conv) {
            let channelType = "evolution";
            if (conv.channel_id) {
              const { data: config } = await supabase
                .from("whatsapp_config")
                .select("channel_type")
                .eq("id", conv.channel_id)
                .maybeSingle();
              if (config) channelType = config.channel_type;
            }

            const sendFunc = channelType === "meta_api" ? "whatsapp-send" : "evolution-send";

            // Call send function internally
            const sendRes = await fetch(`${internalUrl}/functions/v1/${sendFunc}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                apikey: serviceKey,
              },
              body: JSON.stringify({
                to: reminder.customer_phone,
                message: reminder.auto_send_message,
                conversation_id: reminder.conversation_id,
              }),
            });

            if (sendRes.ok) {
              autoSent++;
            } else {
              console.error(`Failed to auto-send follow-up ${reminder.id}:`, await sendRes.text());
            }
          }
        }

        // 3. Add system message
        await supabase.from("messages").insert({
          conversation_id: reminder.conversation_id,
          content: `⏰ تذكير: ${reminder.reminder_note || "متابعة مجدولة"}${reminder.auto_send_message ? " — تم إرسال الرسالة التلقائية" : ""}`,
          sender: "system",
          message_type: "text",
        });

        // 4. Mark as sent
        await supabase.from("follow_up_reminders").update({
          status: "sent",
          sent_at: now,
        }).eq("id", reminder.id);

      } catch (err: any) {
        console.error(`Error processing follow-up ${reminder.id}:`, err);
      }
    }

    // Log
    supabase.from("system_logs").insert({
      level: "info",
      source: "edge_function",
      function_name: "process-follow-ups",
      message: `تمت معالجة ${dueReminders.length} متابعة مجدولة (${notified} إشعار، ${autoSent} رسالة تلقائية)`,
      metadata: { total: dueReminders.length, notified, auto_sent: autoSent },
    }).then(() => {}).catch(() => {});

    return json({ processed: dueReminders.length, notified, auto_sent: autoSent });
  } catch (err: any) {
    console.error("Follow-up processor error:", err);
    return json({ error: err.message }, 500);
  }
});
