import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ─────────────────────────────────────────────
// Lamha Label — Fetch shipment label (PDF)
// GET https://app.lamha.sa/api/v2/label-shipment/{order_id}
// Returns PDF binary (application/pdf)
// ─────────────────────────────────────────────

const LAMHA_API_BASE = "https://app.lamha.sa/api/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { order_id, org_id, lamha_order_id } = body;

  if (!org_id || (!order_id && !lamha_order_id)) {
    return new Response(JSON.stringify({ error: "org_id and (order_id or lamha_order_id) required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Get Lamha integration config
    const { data: integration } = await supabase
      .from("store_integrations")
      .select("*")
      .eq("org_id", org_id)
      .eq("platform", "lamha")
      .eq("is_active", true)
      .maybeSingle();

    if (!integration) {
      return new Response(JSON.stringify({ error: "Lamha integration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiToken = integration.metadata?.api_token;
    if (!apiToken) {
      return new Response(JSON.stringify({ error: "Lamha API token not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve lamha_order_id from shipment_events if not provided
    let resolvedLamhaOrderId = lamha_order_id;

    if (!resolvedLamhaOrderId && order_id) {
      const { data: events } = await supabase
        .from("shipment_events")
        .select("metadata")
        .eq("order_id", order_id)
        .eq("org_id", org_id)
        .eq("source", "lamha")
        .in("status_key", ["created", "order_only"])
        .order("created_at", { ascending: false })
        .limit(1);

      if (events && events.length > 0) {
        resolvedLamhaOrderId = (events[0].metadata as any)?.lamha_order_id;
      }
    }

    if (!resolvedLamhaOrderId) {
      return new Response(JSON.stringify({ error: "Could not resolve Lamha order ID. Order may not have been sent to Lamha yet." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[lamha-label] Fetching label for lamha_order_id=${resolvedLamhaOrderId}`);

    // Fetch label PDF from Lamha
    const labelRes = await fetch(`${LAMHA_API_BASE}/label-shipment/${resolvedLamhaOrderId}`, {
      method: "GET",
      headers: {
        "X-LAMHA-TOKEN": apiToken,
        "Accept": "application/pdf",
      },
    });

    if (!labelRes.ok) {
      const errorText = await labelRes.text().catch(() => "");
      console.error(`[lamha-label] Lamha API error: ${labelRes.status}`, errorText);

      return new Response(JSON.stringify({
        error: "Failed to fetch label",
        status: labelRes.status,
        details: errorText.substring(0, 200),
      }), {
        status: labelRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = labelRes.headers.get("content-type") || "";

    // If response is PDF, return as base64 (for frontend display)
    if (contentType.includes("pdf") || contentType.includes("octet-stream")) {
      const pdfBuffer = await labelRes.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(pdfBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      return new Response(JSON.stringify({
        success: true,
        lamha_order_id: resolvedLamhaOrderId,
        label_pdf_base64: base64,
        content_type: "application/pdf",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If response is JSON (e.g., error or URL)
    try {
      const jsonData = await labelRes.json();
      return new Response(JSON.stringify({
        success: true,
        lamha_order_id: resolvedLamhaOrderId,
        label_data: jsonData,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      const textData = await labelRes.text();
      return new Response(JSON.stringify({
        success: true,
        lamha_order_id: resolvedLamhaOrderId,
        label_url: textData,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error(`[lamha-label] Error:`, err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
