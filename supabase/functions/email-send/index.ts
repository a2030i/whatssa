import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function getCallerProfile(authHeader: string | null) {
  if (!authHeader) return null;
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return null;

  const admin = getExternalClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, full_name")
    .eq("id", user.id)
    .single();
  return profile;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const profile = await getCallerProfile(authHeader);
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, subject, body: emailBody, config_id, conversation_id } = await req.json();
    
    if (!to || !subject || !emailBody) {
      return new Response(JSON.stringify({ error: "to, subject, body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getExternalClient();

    // Get email config
    let configQuery = admin.from("email_configs").select("*").eq("org_id", profile.org_id).eq("is_active", true);
    if (config_id) {
      configQuery = configQuery.eq("id", config_id);
    }
    const { data: configs, error: configError } = await configQuery.limit(1).single();
    
    if (configError || !configs) {
      return new Response(JSON.stringify({ error: "No active email config found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = configs;
    console.log(`[email-send] Sending from ${config.email_address} to ${to}`);

    // Send via SMTP
    const tls = config.encryption === "ssl" || config.smtp_port === 465;
    const client = new SMTPClient({
      connection: {
        hostname: config.smtp_host,
        port: config.smtp_port,
        tls,
        auth: {
          username: config.smtp_username,
          password: config.smtp_password,
        },
      },
    });

    await client.send({
      from: config.email_address,
      to,
      subject,
      content: emailBody,
      html: emailBody,
    });

    await client.close();
    console.log(`[email-send] Email sent successfully to ${to}`);

    // Create or update conversation for this email
    let convId = conversation_id;
    if (!convId) {
      // Check for existing email conversation with this recipient
      const { data: existing } = await admin
        .from("conversations")
        .select("id")
        .eq("org_id", profile.org_id)
        .eq("customer_phone", to)
        .eq("conversation_type", "email")
        .neq("status", "closed")
        .limit(1)
        .maybeSingle();

      if (existing) {
        convId = existing.id;
      } else {
        // Create new email conversation
        const { data: newConv, error: convError } = await admin
          .from("conversations")
          .insert({
            org_id: profile.org_id,
            customer_phone: to,
            customer_name: to,
            conversation_type: "email",
            status: "active",
            last_message: `📧 ${subject}`,
            last_message_at: new Date().toISOString(),
            last_message_sender: "agent",
            assigned_to: profile.full_name,
            assigned_to_id: profile.id,
            assigned_at: new Date().toISOString(),
            channel_id: null,
          })
          .select("id")
          .single();

        if (convError) {
          console.error("[email-send] Failed to create conversation:", convError);
        } else {
          convId = newConv.id;
        }
      }
    }

    // Save sent message
    if (convId) {
      await admin.from("messages").insert({
        conversation_id: convId,
        sender: "agent",
        content: `📧 ${subject}\n\n${emailBody.replace(/<[^>]*>/g, "")}`,
        message_type: "text",
        status: "sent",
        metadata: {
          email_subject: subject,
          email_from: config.email_address,
          email_to: to,
          sent_by: profile.id,
          sent_by_name: profile.full_name,
        },
      });

      // Update conversation last message
      await admin.from("conversations").update({
        last_message: `📧 ${subject}`,
        last_message_at: new Date().toISOString(),
        last_message_sender: "agent",
        updated_at: new Date().toISOString(),
      }).eq("id", convId);
    }

    return new Response(JSON.stringify({ success: true, conversation_id: convId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[email-send] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
