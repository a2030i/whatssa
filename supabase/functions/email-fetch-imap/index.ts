import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { ImapClient } from "jsr:@bobbyg603/deno-imap@0.2.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Decode RFC 2047 MIME encoded-words in email headers.
 */
function decodeMimeWords(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset, encoding, encoded) => {
      try {
        if (encoding.toUpperCase() === "B") {
          const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
          return new TextDecoder(charset).decode(bytes);
        } else {
          const qpDecoded = encoded
            .replace(/_/g, " ")
            .replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          const bytes = new Uint8Array(
            [...qpDecoded].map((c) => c.charCodeAt(0))
          );
          return new TextDecoder(charset).decode(bytes);
        }
      } catch {
        return encoded;
      }
    }
  );
}

/**
 * Decode Quoted-Printable body content
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "") // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/**
 * Decode Base64 body content with charset support
 */
function decodeBase64Body(text: string, charset = "utf-8"): string {
  try {
    const clean = text.replace(/\r?\n/g, "").trim();
    const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return text;
  }
}

/**
 * Extract plain text from HTML
 */
function htmlToText(html: string): string {
  return html
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
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract readable body from all possible msg shapes
 */
function extractBody(msg: any): string {
  // 1. Try msg.body
  if (msg.body) {
    if (typeof msg.body === "string" && msg.body.trim().length > 0) {
      return msg.body;
    }
    if (msg.body.text && typeof msg.body.text === "string" && msg.body.text.trim().length > 0) {
      return msg.body.text;
    }
    if (msg.body.html && typeof msg.body.html === "string") {
      return htmlToText(msg.body.html);
    }
  }

  // 2. Try msg.bodyParts (some IMAP libs return parts array)
  if (msg.bodyParts && Array.isArray(msg.bodyParts)) {
    for (const part of msg.bodyParts) {
      if (part.type === "text/plain" && part.content) {
        return typeof part.content === "string" ? part.content : new TextDecoder().decode(part.content);
      }
    }
    for (const part of msg.bodyParts) {
      if (part.type === "text/html" && part.content) {
        const html = typeof part.content === "string" ? part.content : new TextDecoder().decode(part.content);
        return htmlToText(html);
      }
    }
  }

  // 3. Try raw body sections (BODY[1], BODY[TEXT], etc.)
  for (const key of Object.keys(msg)) {
    if (key.startsWith("body[") || key.startsWith("BODY[")) {
      const val = msg[key];
      if (typeof val === "string" && val.trim().length > 0) {
        // Check if it looks like HTML
        if (val.includes("<html") || val.includes("<body") || val.includes("<div")) {
          return htmlToText(val);
        }
        return val;
      }
      if (val instanceof Uint8Array) {
        return new TextDecoder().decode(val);
      }
    }
  }

  // 4. Try msg.text directly
  if (msg.text && typeof msg.text === "string") return msg.text;

  return "";
}

/**
 * Normalize subject for threading - strip Re:/Fwd:/[tags]
 */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^\[.*?\]\s*/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Clean reply/quoted content from email body
 */
function cleanQuotedContent(body: string): string {
  return body
    .replace(/^>.*$/gm, "")
    .replace(/^On .* wrote:$/gm, "")
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*$/m, "")
    .replace(/^_{3,}[\s\S]*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
 * Find existing conversation by email thread (subject + references chain)
 * Each unique email subject = separate conversation thread
 */
async function findOrCreateConversation(
  admin: any,
  orgId: string,
  senderEmail: string,
  senderName: string,
  subject: string,
  messageId: string,
  inReplyTo: string,
  references: string,
  date: string,
  config: any,
): Promise<string | null> {
  const normSubject = normalizeSubject(subject);

  // Strategy 1: Match by In-Reply-To or References header
  // If this email is a reply, find the conversation that has the parent message
  if (inReplyTo) {
    const { data: parentMsg } = await admin
      .from("messages")
      .select("conversation_id")
      .eq("wa_message_id", inReplyTo)
      .limit(1)
      .maybeSingle();
    if (parentMsg) return parentMsg.conversation_id;
  }

  // Check references chain
  if (references) {
    const refIds = references.split(/\s+/).filter(Boolean);
    for (const refId of refIds.reverse()) {
      const { data: refMsg } = await admin
        .from("messages")
        .select("conversation_id")
        .eq("wa_message_id", refId.trim())
        .limit(1)
        .maybeSingle();
      if (refMsg) return refMsg.conversation_id;
    }
  }

  // Strategy 2: Match by normalized subject within same org
  // Find any conversation (from any sender) with matching subject
  if (normSubject.length > 0) {
    const { data: convs } = await admin
      .from("conversations")
      .select("id, notes")
      .eq("org_id", orgId)
      .eq("conversation_type", "email")
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (convs && convs.length > 0) {
      for (const conv of convs) {
        // notes stores "📧 <subject>" — extract and compare
        const convSubject = (conv.notes || "").replace(/^📧\s*/, "").trim();
        if (normalizeSubject(convSubject) === normSubject) {
          return conv.id;
        }
      }
    }
  }

  // Strategy 3: No match — create new conversation
  const insertData: Record<string, any> = {
    org_id: orgId,
    customer_phone: senderEmail,
    customer_name: senderName,
    conversation_type: "email",
    status: "active",
    last_message: subject,
    last_message_at: date,
    channel_id: null,
    notes: `📧 ${subject.replace(/^(re|fwd|fw)\s*:\s*/gi, "").replace(/^\[.*?\]\s*/g, "").trim()}`,
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
    console.error(`Conv create failed for ${senderEmail}: ${convError.message}`);
    return null;
  }
  return newConv.id;
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

    const inbox = await client.selectMailbox("INBOX");
    const totalMessages = inbox.exists || 0;
    console.log(`[email-fetch] INBOX has ${totalMessages} messages`);

    if (totalMessages === 0) {
      client.disconnect();
      return { fetched: 0, errors };
    }

    // Determine which messages to fetch
    let messageIds: number[] = [];
    try {
      if (config.sync_mode === "all") {
        const start = Math.max(1, totalMessages - 99);
        messageIds = Array.from({ length: totalMessages - start + 1 }, (_, i) => start + i);
      } else {
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

    const toFetch = messageIds.slice(-30);
    console.log(`[email-fetch] Fetching ${toFetch.length} messages`);

    // Fetch with body content
    const fetchRange = toFetch.join(",");
    const messages = await client.fetch(fetchRange, {
      envelope: true,
      body: true,
      headers: ["Subject", "From", "To", "Date", "Message-ID", "In-Reply-To", "References", "Content-Type", "Content-Transfer-Encoding"],
    });

    for (const msg of messages) {
      try {
        const envelope = msg.envelope;
        if (!envelope) continue;

        const fromAddr = envelope.from?.[0];
        const senderEmail = fromAddr
          ? `${fromAddr.mailbox}@${fromAddr.host}`
          : "unknown@unknown.com";
        const senderName = decodeMimeWords(fromAddr?.name) || senderEmail;
        const subject = decodeMimeWords(envelope.subject) || "(بدون عنوان)";
        const emailMessageId = envelope.messageId || `imap-${msg.seq}-${Date.now()}`;
        const date = envelope.date
          ? new Date(envelope.date).toISOString()
          : new Date().toISOString();

        // Skip our own outgoing emails
        if (senderEmail.toLowerCase() === config.email_address.toLowerCase()) {
          continue;
        }

        // Dedup by messageId
        const { data: existing } = await admin
          .from("messages")
          .select("id")
          .eq("wa_message_id", emailMessageId)
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        // Get threading headers
        const inReplyTo = envelope.inReplyTo || 
          (msg.headers?.["In-Reply-To"] || msg.headers?.["in-reply-to"] || "");
        const references = (msg.headers?.["References"] || msg.headers?.["references"] || "") as string;

        // Find or create threaded conversation
        const convId = await findOrCreateConversation(
          admin, orgId, senderEmail, senderName, subject,
          emailMessageId, inReplyTo, references, date, config,
        );
        if (!convId) {
          errors.push(`Could not find/create conversation for ${senderEmail}`);
          continue;
        }

        // Extract body content
        let bodyText = extractBody(msg);

        // If body is still empty, try fetching raw body separately
        if (!bodyText || bodyText.trim().length === 0) {
          console.log(`[email-fetch] Body empty for msg ${msg.seq}, trying raw fetch`);
          try {
            const rawMessages = await client.fetch(String(msg.seq), {
              body: true,
            });
            if (rawMessages && rawMessages.length > 0) {
              bodyText = extractBody(rawMessages[0]);
            }
          } catch (rawErr: any) {
            console.log(`[email-fetch] Raw fetch failed: ${rawErr.message}`);
          }
        }

        // Decode content-transfer-encoding if needed
        const cte = (msg.headers?.["Content-Transfer-Encoding"] || 
                     msg.headers?.["content-transfer-encoding"] || "").toString().toLowerCase().trim();
        const contentType = (msg.headers?.["Content-Type"] || 
                            msg.headers?.["content-type"] || "").toString();
        const charsetMatch = contentType.match(/charset=["']?([^;"'\s]+)/i);
        const charset = charsetMatch ? charsetMatch[1] : "utf-8";

        if (bodyText && cte === "base64") {
          bodyText = decodeBase64Body(bodyText, charset);
        } else if (bodyText && cte === "quoted-printable") {
          bodyText = decodeQuotedPrintable(bodyText);
          // Re-decode charset if not utf-8
          if (charset.toLowerCase() !== "utf-8") {
            try {
              const bytes = new Uint8Array([...bodyText].map(c => c.charCodeAt(0)));
              bodyText = new TextDecoder(charset).decode(bytes);
            } catch {}
          }
        }

        // Also decode any MIME words in the body
        bodyText = decodeMimeWords(bodyText);

        // Clean quoted content
        const cleanBody = cleanQuotedContent(bodyText);
        const displayContent = cleanBody.substring(0, 10000) || subject || "(بدون محتوى)";

        // Insert message
        const { error: msgError } = await admin.from("messages").insert({
          conversation_id: convId,
          sender: "customer",
          content: displayContent,
          message_type: "text",
          status: "received",
          wa_message_id: emailMessageId,
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

        // Update conversation last message with body preview (not subject)
        await admin.from("conversations").update({
          last_message: cleanBody.substring(0, 200) || subject,
          last_message_at: date,
          last_message_sender: "customer",
          customer_name: senderName,
          customer_phone: senderEmail,
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
