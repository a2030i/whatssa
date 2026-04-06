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
 * Parse email address from IMAP envelope format
 * e.g. "John Doe <john@example.com>" → { name: "John Doe", email: "john@example.com" }
 */
function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(?:"?([^"]*)"?\s)?<?([^\s>]+@[^\s>]+)>?$/);
  if (match) {
    return { name: match[1]?.trim() || match[2], email: match[2] };
  }
  return { name: raw, email: raw };
}

/**
 * Extract plain text from potentially multipart email body
 */
function extractTextContent(body: any): string {
  if (typeof body === "string") return body;
  if (body?.text) return body.text;
  if (body?.html) {
    // Strip HTML tags for plain text display
    return body.html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  }
  if (Array.isArray(body)) {
    for (const part of body) {
      const text = extractTextContent(part);
      if (text) return text;
    }
  }
  return JSON.stringify(body || "");
}

/**
 * Fetch emails from a single IMAP config
 */
async function fetchEmailsForConfig(
  admin: any,
  config: any,
  orgId: string,
  maxEmails: number = 50
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
    console.log(`[email-fetch] Connected to ${config.imap_host} for ${config.email_address}`);

    // Select INBOX
    const inbox = await client.selectMailbox("INBOX");
    const totalMessages = inbox.exists || 0;
    console.log(`[email-fetch] INBOX has ${totalMessages} messages`);

    if (totalMessages === 0) {
      await client.logout();
      return { fetched: 0, errors };
    }

    // Determine fetch strategy based on sync_mode
    let searchCriteria: string;
    if (config.sync_mode === "all") {
      // Fetch last N messages
      searchCriteria = "ALL";
    } else {
      // new_only: fetch UNSEEN messages
      searchCriteria = "UNSEEN";
    }

    // Search for messages
    const searchResult = await client.search({ unseen: searchCriteria === "UNSEEN" });
    
    if (!searchResult || searchResult.length === 0) {
      console.log(`[email-fetch] No new messages for ${config.email_address}`);
      await client.logout();
      return { fetched: 0, errors };
    }

    // Limit the number of messages to fetch
    const messageIds = searchResult.slice(-maxEmails);
    console.log(`[email-fetch] Fetching ${messageIds.length} messages`);

    // Fetch message details
    const fetchRange = messageIds.join(",");
    const messages = await client.fetch(fetchRange, {
      envelope: true,
      body: true,
      headers: ["Subject", "From", "To", "Date", "Message-ID"],
    });

    for (const msg of messages) {
      try {
        const envelope = msg.envelope;
        if (!envelope) continue;

        const fromRaw = envelope.from?.[0] 
          ? `${envelope.from[0].name || ""} <${envelope.from[0].mailbox}@${envelope.from[0].host}>`
          : "unknown";
        const { name: senderName, email: senderEmail } = parseEmailAddress(fromRaw);
        const subject = envelope.subject || "(بدون عنوان)";
        const messageId = envelope.messageId || `imap-${Date.now()}-${Math.random()}`;
        const date = envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString();

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

        if (existing) {
          continue; // Already imported
        }

        // Find or create conversation for this sender
        const { data: existingConv } = await admin
          .from("conversations")
          .select("id")
          .eq("org_id", orgId)
          .eq("customer_phone", senderEmail)
          .eq("conversation_type", "email")
          .neq("status", "closed")
          .limit(1)
          .maybeSingle();

        let convId: string;

        if (existingConv) {
          convId = existingConv.id;
        } else {
          // Create new email conversation
          const insertData: Record<string, any> = {
            org_id: orgId,
            customer_phone: senderEmail,
            customer_name: senderName,
            conversation_type: "email",
            status: "active",
            last_message: `📧 ${subject}`,
            last_message_at: date,
            last_message_sender: "customer",
            channel_id: null,
          };

          // Auto-assign dedicated agent/team if configured
          if (config.dedicated_agent_id) {
            insertData.assigned_to_id = config.dedicated_agent_id;
            // Get agent name
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
            if (team) {
              insertData.assigned_team = team.name;
            }
          }

          const { data: newConv, error: convError } = await admin
            .from("conversations")
            .insert(insertData)
            .select("id")
            .single();

          if (convError) {
            errors.push(`Failed to create conversation for ${senderEmail}: ${convError.message}`);
            continue;
          }
          convId = newConv.id;
        }

        // Extract body content
        const bodyContent = extractTextContent(msg.body);
        const displayContent = `📧 ${subject}\n\n${bodyContent}`.substring(0, 10000);

        // Insert message
        const { error: msgError } = await admin.from("messages").insert({
          conversation_id: convId,
          sender: "customer",
          content: displayContent,
          message_type: "text",
          status: "received",
          wa_message_id: messageId, // Used for dedup
          created_at: date,
          metadata: {
            email_subject: subject,
            email_from: senderEmail,
            email_from_name: senderName,
            email_to: config.email_address,
            imap_fetched: true,
          },
        });

        if (msgError) {
          errors.push(`Failed to save message from ${senderEmail}: ${msgError.message}`);
          continue;
        }

        // Update conversation last message
        await admin.from("conversations").update({
          last_message: `📧 ${subject}`,
          last_message_at: date,
          last_message_sender: "customer",
          unread_count: 1,
          updated_at: new Date().toISOString(),
        }).eq("id", convId);

        fetched++;
      } catch (msgErr: any) {
        errors.push(`Error processing message: ${msgErr.message}`);
      }
    }

    // Mark fetched messages as seen
    if (messageIds.length > 0 && config.sync_mode !== "all") {
      try {
        // Mark as read on IMAP server
        for (const id of messageIds) {
          try {
            await client.addFlags(String(id), ["\\Seen"]);
          } catch (_) {
            // Ignore flag errors
          }
        }
      } catch (_) {
        // Ignore flag errors
      }
    }

    await client.logout();
    console.log(`[email-fetch] Done for ${config.email_address}: fetched=${fetched} errors=${errors.length}`);
  } catch (e: any) {
    errors.push(`IMAP error for ${config.email_address}: ${e.message}`);
    console.error(`[email-fetch] IMAP error:`, e.message);
    try { if (client) await client.logout(); } catch (_) {}
  }

  return { fetched, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = getExternalClient();
    let orgId: string | null = null;
    let configId: string | undefined;

    // Check if called with auth (manual trigger) or without (cron)
    const authHeader = req.headers.get("Authorization");

    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_ANON_KEY") || "___")) {
      // Manual trigger — user authenticated
      const profile = await getCallerProfile(authHeader);
      if (!profile?.org_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      orgId = profile.org_id;

      // Optionally filter to a specific config
      try {
        const body = await req.json();
        configId = body?.config_id;
      } catch (_) {}
    }

    // Build query for active email configs with IMAP configured
    let query = admin
      .from("email_configs")
      .select("*")
      .eq("is_active", true)
      .not("imap_host", "is", null)
      .neq("imap_host", "");

    if (orgId) {
      query = query.eq("org_id", orgId);
    }
    if (configId) {
      query = query.eq("id", configId);
    }

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
