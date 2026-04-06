import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ImapClient } from "jsr:@bobbyg603/deno-imap@0.2.1";

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
  const { data: profile } = await userClient
    .from("profiles")
    .select("id, org_id, full_name")
    .limit(1)
    .maybeSingle();
  return profile;
}

/**
 * Fetch emails from a single IMAP config
 */
async function fetchEmailsForConfig(
  admin: any,
  config: any,
  orgId: string,
): Promise<{ fetched: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;

  if (!config.imap_host || !config.imap_port) {
    errors.push(`Config ${config.id}: Missing IMAP host/port`);
    return { fetched, errors };
  }

  let client: ImapClient | null = null;

  try {
    const useTls = config.encryption === "ssl" || config.imap_port === 993;

    client = new ImapClient({
      host: config.imap_host,
      port: config.imap_port,
      tls: useTls,
      username: config.smtp_username,
      password: config.smtp_password,
    });

    await client.connect();
    await client.authenticate();
    console.log(`[email-fetch] Connected to ${config.imap_host} for ${config.email_address}`);

    // Select INBOX
    const inbox = await client.selectMailbox("INBOX");
    const totalMessages = inbox.exists || 0;
    console.log(`[email-fetch] INBOX has ${totalMessages} messages`);

    if (totalMessages === 0) {
      client.disconnect();
      return { fetched: 0, errors };
    }

    // Search for UNSEEN messages
    let messageIds: number[] = [];
    try {
      if (config.sync_mode === "all") {
        // Fetch last 30 messages
        const start = Math.max(1, totalMessages - 29);
        messageIds = Array.from({ length: totalMessages - start + 1 }, (_, i) => start + i);
      } else {
        // new_only: search for UNSEEN
        messageIds = await client.search({ flags: { has: ["\\Unseen"] } });
      }
    } catch (searchErr: any) {
      console.log(`[email-fetch] Search failed, falling back to last 20:`, searchErr.message);
      const start = Math.max(1, totalMessages - 19);
      messageIds = Array.from({ length: totalMessages - start + 1 }, (_, i) => start + i);
    }

    if (!messageIds || messageIds.length === 0) {
      console.log(`[email-fetch] No new messages for ${config.email_address}`);
      client.disconnect();
      return { fetched: 0, errors };
    }

    // Cap at 30 messages per fetch
    const toFetch = messageIds.slice(-30);
    console.log(`[email-fetch] Fetching ${toFetch.length} messages`);

    // Fetch message details
    const fetchRange = toFetch.join(",");
    const messages = await client.fetch(fetchRange, {
      envelope: true,
      body: true,
      headers: ["Subject", "From", "To", "Date", "Message-ID"],
    });

    for (const msg of messages) {
      try {
        const envelope = msg.envelope;
        if (!envelope) continue;

        // Build sender info
        const fromAddr = envelope.from?.[0];
        const senderEmail = fromAddr
          ? `${fromAddr.mailbox}@${fromAddr.host}`
          : "unknown@unknown.com";
        const senderName = fromAddr?.name || senderEmail;
        const subject = envelope.subject || "(بدون عنوان)";
        const messageId = envelope.messageId || `imap-${msg.seq}-${Date.now()}`;
        const date = envelope.date
          ? new Date(envelope.date).toISOString()
          : new Date().toISOString();

        // Skip emails sent FROM our own address (outgoing)
        if (senderEmail.toLowerCase() === config.email_address.toLowerCase()) {
          continue;
        }

        // Check if this message was already imported (dedup by messageId)
        const { data: existing } = await admin
          .from("messages")
          .select("id")
          .eq("wa_message_id", messageId)
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        // Find or create conversation for this sender
        // Thread by In-Reply-To or References header for grouping replies
        const inReplyTo = envelope.inReplyTo || "";
        const references = (msg.headers?.["References"] || msg.headers?.["references"] || "") as string;
        
        // Normalize subject for threading (strip Re:/Fwd: prefixes)
        const normalizedSubject = subject.replace(/^(re|fwd|fw)\s*:\s*/gi, "").replace(/^\[.*?\]\s*/g, "").trim();
        
        // First try to find existing conversation by email address + open status
        let { data: existingConv } = await admin
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("customer_phone", senderEmail)
          .eq("conversation_type", "email")
          .neq("status", "closed")
          .order("created_at", { ascending: false })
          .limit(5);

        // If multiple open convos exist, try to match by subject
        let convMatch: { id: string } | null = null;
        if (existingConv && existingConv.length > 0) {
          // Default to most recent
          convMatch = existingConv[0];
        }
          .maybeSingle();

        let convId: string;  
        
        if (convMatch) {
          convId = convMatch.id;
        } else {
          const insertData: Record<string, any> = {
            org_id: orgId,
            customer_phone: senderEmail,
            customer_name: `${senderName}`,
            conversation_type: "email",
            status: "active",
            last_message: subject,
            last_message_at: date,
            channel_id: null,
            notes: `📧 ${subject}`,
          };

          if (config.dedicated_agent_id) {
            insertData.assigned_to_id = config.dedicated_agent_id;
            const { data: agentProfile } = await admin
              .from("profiles")
              .select("full_name")
              .eq("id", config.dedicated_agent_id)
              .single();
            if (agentProfile) {
              insertData.assigned_to = agentProfile.full_name;
              insertData.assigned_at = new Date().toISOString();
            }
          }
          if (config.dedicated_team_id) {
            insertData.assigned_team_id = config.dedicated_team_id;
            const { data: team } = await admin
              .from("teams")
              .select("name")
              .eq("id", config.dedicated_team_id)
              .single();
            if (team) insertData.assigned_team = team.name;
          }

          const { data: newConv, error: convError } = await admin
            .from("conversations")
            .insert(insertData)
            .select("id")
            .single();

          if (convError) {
            errors.push(`Conv create failed for ${senderEmail}: ${convError.message}`);
            continue;
          }
          convId = newConv.id;
        }

        // Extract body content - clean up for readability
        let bodyText = "";
        if (msg.body) {
          if (typeof msg.body === "string") {
            bodyText = msg.body;
          } else if (msg.body.text) {
            bodyText = msg.body.text;
          } else if (msg.body.html) {
            // Better HTML-to-text: preserve line breaks
            bodyText = msg.body.html
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n\n")
              .replace(/<\/div>/gi, "\n")
              .replace(/<\/tr>/gi, "\n")
              .replace(/<\/li>/gi, "\n")
              .replace(/<[^>]*>/g, "")
              .replace(/&nbsp;/gi, " ")
              .replace(/&amp;/gi, "&")
              .replace(/&lt;/gi, "<")
              .replace(/&gt;/gi, ">")
              .replace(/&quot;/gi, '"')
              .replace(/\n{3,}/g, "\n\n")
              .trim();
          } else {
            bodyText = JSON.stringify(msg.body).substring(0, 500);
          }
        }

        // Clean up quoted reply content (lines starting with >)
        const cleanBody = bodyText
          .replace(/^>.*$/gm, "")
          .replace(/^On .* wrote:$/gm, "")
          .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*$/m, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        
        const displayContent = cleanBody.substring(0, 10000) || "(بدون محتوى)";

        // Insert message
        const { error: msgError } = await admin.from("messages").insert({
          conversation_id: convId,
          sender: "customer",
          content: displayContent,
          message_type: "text",
          status: "received",
          wa_message_id: messageId,
          created_at: date,
          metadata: {
            email_subject: subject,
            email_from: senderEmail,
            email_from_name: senderName,
            email_to: config.email_address,
            imap_fetched: true,
            email_in_reply_to: inReplyTo || undefined,
            email_references: references || undefined,
          },
        });

        if (msgError) {
          errors.push(`Msg save failed: ${msgError.message}`);
          continue;
        }

        // Update conversation last message
        await admin.from("conversations").update({
          last_message: cleanBody.substring(0, 200) || subject,
          last_message_at: date,
          updated_at: new Date().toISOString(),
        }).eq("id", convId);

        fetched++;
      } catch (msgErr: any) {
        errors.push(`Msg error: ${msgErr.message}`);
      }
    }

    // Mark fetched as seen
    if (config.sync_mode !== "all") {
      try {
        for (const id of toFetch) {
          try {
            await client.addFlags(String(id), ["\\Seen"]);
          } catch (_) {}
        }
      } catch (_) {}
    }

    client.disconnect();
    console.log(`[email-fetch] Done for ${config.email_address}: fetched=${fetched} errors=${errors.length}`);
  } catch (e: any) {
    errors.push(`IMAP error for ${config.email_address}: ${e.message}`);
    console.error(`[email-fetch] IMAP error:`, e.message);
    try { if (client) client.disconnect(); } catch (_) {}
  }

  return { fetched, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = getExternalClient();
    let orgId: string | null = null;
    let configId: string | undefined;

    const authHeader = req.headers.get("Authorization");

    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY") || "___")) {
      const profile = await getCallerProfile(authHeader);
      if (!profile?.org_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      orgId = profile.org_id;
      try {
        const body = await req.json();
        configId = body?.config_id;
      } catch (_) {}
    }

    let query = admin
      .from("email_configs")
      .select("*")
      .eq("is_active", true)
      .not("imap_host", "is", null)
      .neq("imap_host", "");

    if (orgId) query = query.eq("org_id", orgId);
    if (configId) query = query.eq("id", configId);

    const { data: configs, error: configError } = await query;

    if (configError) {
      console.error("[email-fetch] Config query error:", configError);
      return new Response(JSON.stringify({ error: configError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!configs || configs.length === 0) {
      console.log("[email-fetch] No active IMAP configs found");
      return new Response(JSON.stringify({ message: "No active IMAP configs", fetched: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[email-fetch] Processing ${configs.length} email config(s)`);

    const results: Array<{ config_id: string; email: string; fetched: number; errors: string[] }> = [];

    for (const config of configs) {
      const result = await fetchEmailsForConfig(admin, config, config.org_id);
      results.push({
        config_id: config.id,
        email: config.email_address,
        fetched: result.fetched,
        errors: result.errors,
      });
    }

    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    console.log(`[email-fetch] Total: fetched=${totalFetched} errors=${totalErrors}`);

    return new Response(JSON.stringify({
      success: true,
      total_fetched: totalFetched,
      total_errors: totalErrors,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[email-fetch] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
