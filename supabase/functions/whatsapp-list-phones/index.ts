import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { business_account_id, access_token } = await req.json();

    if (!business_account_id || !access_token) {
      return new Response(
        JSON.stringify({ error: "business_account_id and access_token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch phone numbers from Meta API
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${business_account_id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Meta API error:", data);
      return new Response(
        JSON.stringify({ error: data.error?.message || "Failed to fetch phone numbers" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ phone_numbers: data.data || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
