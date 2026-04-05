import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { org_id, check_type } = await req.json();
    if (!org_id) {
      return new Response(JSON.stringify({ error: "org_id required" }), { status: 400, headers: corsHeaders });
    }

    // Get org's plan
    const { data: org } = await supabase
      .from("organizations")
      .select("plan_id, subscription_status")
      .eq("id", org_id)
      .single();

    if (!org || !org.plan_id) {
      return new Response(JSON.stringify({ allowed: false, reason: "no_plan" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check subscription status
    if (org.subscription_status === "expired" || org.subscription_status === "cancelled") {
      return new Response(JSON.stringify({ allowed: false, reason: "subscription_inactive", status: org.subscription_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan } = await supabase
      .from("plans")
      .select("max_conversations, max_messages_per_month, max_team_members, max_phone_numbers, max_api_tokens")
      .eq("id", org.plan_id)
      .single();

    if (!plan) {
      return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const period = new Date().toISOString().slice(0, 7);
    const { data: usage } = await supabase
      .from("usage_tracking")
      .select("*")
      .eq("org_id", org_id)
      .eq("period", period)
      .maybeSingle();

    const currentUsage = usage || { messages_sent: 0, messages_received: 0, conversations_count: 0, api_calls: 0 };

    const limits = {
      messages: {
        used: (currentUsage.messages_sent || 0) + (currentUsage.messages_received || 0),
        max: plan.max_messages_per_month,
        percentage: plan.max_messages_per_month > 0 ? Math.round(((currentUsage.messages_sent || 0) + (currentUsage.messages_received || 0)) / plan.max_messages_per_month * 100) : 0,
      },
      conversations: {
        used: currentUsage.conversations_count || 0,
        max: plan.max_conversations,
        percentage: plan.max_conversations > 0 ? Math.round((currentUsage.conversations_count || 0) / plan.max_conversations * 100) : 0,
      },
    };

    // Check specific type
    let allowed = true;
    let reason = "";
    let warning = false;

    if (check_type === "message") {
      if (limits.messages.used >= limits.messages.max && limits.messages.max < 999999) {
        allowed = false;
        reason = "message_limit_reached";
      } else if (limits.messages.percentage >= 90) {
        warning = true;
        reason = "message_limit_warning";
      }
    } else if (check_type === "conversation") {
      if (limits.conversations.used >= limits.conversations.max && limits.conversations.max < 999999) {
        allowed = false;
        reason = "conversation_limit_reached";
      } else if (limits.conversations.percentage >= 90) {
        warning = true;
        reason = "conversation_limit_warning";
      }
    }

    return new Response(JSON.stringify({
      allowed,
      warning,
      reason,
      limits,
      plan_name: null,
      subscription_status: org.subscription_status,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("Check limits error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
