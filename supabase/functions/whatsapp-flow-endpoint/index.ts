import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── Action: Process flow submission from webhook ──
    if (action === "submit") {
      const body = await req.json();
      const { org_id, flow_id, customer_phone, customer_name, conversation_id, responses } = body;

      if (!org_id || !flow_id || !customer_phone || !responses) {
        return json({ error: "Missing required fields" }, 400);
      }

      // Save submission
      const { data: submission, error } = await adminClient
        .from("flow_submissions")
        .insert({
          org_id,
          flow_id,
          conversation_id: conversation_id || null,
          customer_phone,
          customer_name: customer_name || null,
          responses,
          status: "new",
        })
        .select("id")
        .single();

      if (error) {
        console.error("Failed to save submission:", error);
        return json({ error: "Failed to save submission" }, 500);
      }

      // Get flow for success message and webhook
      const { data: flow } = await adminClient
        .from("wa_flows")
        .select("success_message, webhook_url, name")
        .eq("id", flow_id)
        .single();

      // Forward to external webhook if configured
      if (flow?.webhook_url) {
        try {
          await fetch(flow.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "flow_submission",
              flow_name: flow.name,
              submission_id: submission.id,
              customer_phone,
              customer_name,
              responses,
              submitted_at: new Date().toISOString(),
            }),
          });
        } catch (e) {
          console.error("Failed to forward to webhook:", e);
        }
      }

      return json({
        success: true,
        submission_id: submission.id,
        success_message: flow?.success_message || "شكراً لك! تم استلام ردك بنجاح ✅",
      });
    }

    // ── Action: Send flow message to customer ──
    if (action === "send-flow") {
      const authorization = req.headers.get("Authorization") || "";
      if (!authorization) return json({ error: "Unauthorized" }, 401);

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data: profile } = await adminClient
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.org_id) return json({ error: "No organization" }, 400);

      const body = await req.json();
      const { flow_id, to, conversation_id } = body;

      if (!flow_id || !to) return json({ error: "flow_id and to are required" }, 400);

      // Get flow
      const { data: flow } = await adminClient
        .from("wa_flows")
        .select("*")
        .eq("id", flow_id)
        .eq("org_id", profile.org_id)
        .single();

      if (!flow) return json({ error: "Flow not found" }, 404);

      const screens = (flow.screens as any[]) || [];
      if (screens.length === 0) return json({ error: "Flow has no screens" }, 400);

      // Build the first screen's questions as a text message with numbered options
      // (This is the chatbot-style approach for flows without Meta Flow API)
      const firstScreen = screens[0];
      const fields = (firstScreen.fields as any[]) || [];

      let messageText = firstScreen.title ? `*${firstScreen.title}*\n\n` : "";

      // For the first field, send its question
      if (fields.length > 0) {
        const field = fields[0];
        messageText += `${field.label}`;

        if (field.type === "radio" || field.type === "select") {
          const options = (field.options || []) as string[];
          messageText += "\n\n";
          options.forEach((opt: string, i: number) => {
            messageText += `${i + 1}. ${opt}\n`;
          });
        }
      }

      // Create a flow session to track progress
      const sessionData = {
        org_id: profile.org_id,
        flow_id: flow.id,
        conversation_id: conversation_id || null,
        customer_phone: to,
        current_screen: 0,
        current_field: 0,
        collected_responses: {},
      };

      // Store session in metadata of conversation
      // We'll use the chatbot_sessions table with a special pattern
      // For now, send the first question via whatsapp-send
      const sendUrl = `${SUPABASE_URL}/functions/v1/whatsapp-send`;
      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to,
          message: messageText,
          conversation_id,
        }),
      });

      const sendResult = await sendRes.json();

      return json({
        success: sendRes.ok,
        message_id: sendResult.message_id,
        session: sessionData,
      });
    }

    // ── Action: List flows for org ──
    if (action === "list") {
      const authorization = req.headers.get("Authorization") || "";
      if (!authorization) return json({ error: "Unauthorized" }, 401);

      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authorization } },
      });
      const { data: { user } } = await authClient.auth.getUser();
      if (!user) return json({ error: "Unauthorized" }, 401);

      const { data: profile } = await adminClient
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile?.org_id) return json({ error: "No organization" }, 400);

      const { data: flows } = await adminClient
        .from("wa_flows")
        .select("*, flow_submissions(count)")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false });

      return json({ flows: flows || [] });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Flow endpoint error:", error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return json({ error: errMsg }, 500);
  }
});
