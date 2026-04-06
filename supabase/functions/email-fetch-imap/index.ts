import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── MIME / Decode helpers ─── */

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
          const bytes = new Uint8Array([...qpDecoded].map((c) => c.charCodeAt(0)));
          return new TextDecoder(charset).decode(bytes);
        }
      } catch {
        return encoded;
      }
    }
  );
}

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function decodeBase64Body(text: string, charset = "utf-8"): string {
  try {
    const clean = text.replace(/\r?\n/g, "").trim();
    const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return text;
  }
}

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

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^\[.*?\]\s*/g, "")
    .trim()
    .toLowerCase();
}

function cleanQuotedContent(body: string): string {
  return body
    .replace(/^>.*$/gm, "")
    .replace(/^On .* wrote:$/gm, "")
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*$/m, "")
    .replace(/^_{3,}[\s\S]*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ─── Raw IMAP client over TLS ─── */

class RawImapClient {
  private conn!: Deno.TlsConn;
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = "";
  private tagCounter = 0;

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string,
  ) {}

  private nextTag(): string {
    return `A${++this.tagCounter}`;
  }

  private async readLine(): Promise<string> {
    while (!this.buffer.includes("\r\n")) {
      const { value, done } = await this.reader.read();
      if (done) throw new Error("Connection closed");
      this.buffer += new TextDecoder().decode(value);
    }
    const idx = this.buffer.indexOf("\r\n");
    const line = this.buffer.substring(0, idx);
    this.buffer = this.buffer.substring(idx + 2);
    return line;
  }

  private async readUntilTag(tag: string): Promise<string[]> {
    const lines: string[] = [];
    const timeout = 30000;
    const start = Date.now();
    while (true) {
      if (Date.now() - start > timeout) throw new Error("IMAP timeout");
      const line = await this.readLine();
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        if (!line.startsWith(`${tag} OK`)) {
          throw new Error(`IMAP error: ${line}`);
        }
        break;
      }
    }
    return lines;
  }

  private async sendCommand(cmd: string): Promise<string[]> {
    const tag = this.nextTag();
    const encoder = new TextEncoder();
    await this.conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
    return await this.readUntilTag(tag);
  }

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: this.host, port: this.port });
    this.reader = this.conn.readable.getReader();
    // Read server greeting
    await this.readLine();
  }

  async login(): Promise<void> {
    // Escape username/password for IMAP LOGIN
    const escUser = `"${this.username.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const escPass = `"${this.password.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    await this.sendCommand(`LOGIN ${escUser} ${escPass}`);
  }

  async selectInbox(): Promise<number> {
    const lines = await this.sendCommand("SELECT INBOX");
    let exists = 0;
    for (const line of lines) {
      const m = line.match(/\*\s+(\d+)\s+EXISTS/i);
      if (m) exists = parseInt(m[1]);
    }
    return exists;
  }

  async searchUnseen(): Promise<number[]> {
    const lines = await this.sendCommand("SEARCH UNSEEN");
    for (const line of lines) {
      if (line.startsWith("* SEARCH")) {
        const ids = line.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean).map(Number);
        return ids;
      }
    }
    return [];
  }

  async fetchMessages(seqSet: string): Promise<any[]> {
    const tag = this.nextTag();
    const cmd = `${tag} FETCH ${seqSet} (BODY[HEADER.FIELDS (Subject From To Cc Date Message-ID In-Reply-To References Content-Type Content-Transfer-Encoding)] BODY[TEXT])\r\n`;
    const encoder = new TextEncoder();
    await this.conn.write(encoder.encode(cmd));

    // Read all response data until we get the tag completion
    const messages: any[] = [];
    let currentMsg: any = null;
    let collectingHeader = false;
    let collectingBody = false;
    let headerData = "";
    let bodyData = "";
    let bodyBytesRemaining = 0;

    const timeout = 60000;
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeout) throw new Error("IMAP fetch timeout");

      const line = await this.readLine();

      // Tag completion
      if (line.startsWith(`${tag} `)) {
        if (currentMsg) {
          currentMsg.headers = this.parseHeaders(headerData);
          currentMsg.bodyText = bodyData;
          messages.push(currentMsg);
        }
        if (!line.startsWith(`${tag} OK`)) {
          throw new Error(`IMAP fetch error: ${line}`);
        }
        break;
      }

      // Start of a new FETCH response
      const fetchMatch = line.match(/^\*\s+(\d+)\s+FETCH\s+\(/i);
      if (fetchMatch) {
        if (currentMsg) {
          currentMsg.headers = this.parseHeaders(headerData);
          currentMsg.bodyText = bodyData;
          messages.push(currentMsg);
        }
        currentMsg = { seq: parseInt(fetchMatch[1]) };
        headerData = "";
        bodyData = "";
        collectingHeader = false;
        collectingBody = false;
      }

      // Detect literal start {N}
      const literalMatch = line.match(/\{(\d+)\}$/);
      if (literalMatch) {
        const size = parseInt(literalMatch[1]);
        if (line.includes("HEADER.FIELDS")) {
          collectingHeader = true;
          collectingBody = false;
          bodyBytesRemaining = size;
          headerData = "";
        } else if (line.includes("BODY[TEXT]") || line.includes("BODY[1]")) {
          collectingBody = true;
          collectingHeader = false;
          bodyBytesRemaining = size;
          bodyData = "";
        }
        continue;
      }

      if (collectingHeader) {
        if (line === "" || line === ")") {
          collectingHeader = false;
        } else {
          headerData += line + "\n";
        }
      } else if (collectingBody) {
        if (line === ")") {
          collectingBody = false;
        } else {
          bodyData += line + "\n";
        }
      }
    }

    return messages;
  }

  private parseHeaders(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = raw.split(/\r?\n/);
    let currentKey = "";
    let currentValue = "";

    for (const line of lines) {
      if (line.match(/^\s+/) && currentKey) {
        // Continuation of previous header
        currentValue += " " + line.trim();
      } else {
        if (currentKey) {
          headers[currentKey.toLowerCase()] = currentValue;
        }
        const m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
          currentKey = m[1];
          currentValue = m[2];
        } else {
          currentKey = "";
          currentValue = "";
        }
      }
    }
    if (currentKey) {
      headers[currentKey.toLowerCase()] = currentValue;
    }
    return headers;
  }

  async disconnect(): Promise<void> {
    try {
      const tag = this.nextTag();
      const encoder = new TextEncoder();
      await this.conn.write(encoder.encode(`${tag} LOGOUT\r\n`));
    } catch (_) {}
    try { this.reader.releaseLock(); } catch (_) {}
    try { this.conn.close(); } catch (_) {}
  }
}

/* ─── Supabase helpers ─── */

function getExternalClient() {
  return createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getCallerProfile(authHeader: string | null) {
  if (!authHeader) return null;
  const userClient = createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: profile } = await userClient
    .from("profiles")
    .select("id, org_id, full_name")
    .limit(1)
    .maybeSingle();
  return profile;
}

/* ─── Threading ─── */

async function findOrCreateConversation(
  admin: any, orgId: string, senderEmail: string, senderName: string,
  subject: string, messageId: string, inReplyTo: string, references: string,
  date: string, config: any,
): Promise<string | null> {
  const normSubject = normalizeSubject(subject);

  // Strategy 1: Match by In-Reply-To
  if (inReplyTo) {
    const { data: parentMsg } = await admin
      .from("messages").select("conversation_id")
      .eq("wa_message_id", inReplyTo).limit(1).maybeSingle();
    if (parentMsg) return parentMsg.conversation_id;
  }

  // Check references chain
  if (references) {
    const refIds = references.split(/\s+/).filter(Boolean);
    for (const refId of refIds.reverse()) {
      const { data: refMsg } = await admin
        .from("messages").select("conversation_id")
        .eq("wa_message_id", refId.trim()).limit(1).maybeSingle();
      if (refMsg) return refMsg.conversation_id;
    }
  }

  // Strategy 2: Match by normalized subject
  if (normSubject.length > 0) {
    const { data: convs } = await admin
      .from("conversations").select("id, notes")
      .eq("org_id", orgId).eq("conversation_type", "email")
      .neq("status", "closed")
      .order("created_at", { ascending: false }).limit(50);

    if (convs) {
      for (const conv of convs) {
        const convSubject = (conv.notes || "").replace(/^📧\s*/, "").trim();
        if (normalizeSubject(convSubject) === normSubject) return conv.id;
      }
    }
  }

  // Strategy 3: Create new
  const insertData: Record<string, any> = {
    org_id: orgId, customer_phone: senderEmail, customer_name: senderName,
    conversation_type: "email", status: "active",
    last_message: subject, last_message_at: date, channel_id: null,
    notes: `📧 ${subject.replace(/^(re|fwd|fw)\s*:\s*/gi, "").replace(/^\[.*?\]\s*/g, "").trim()}`,
  };

  if (config.dedicated_agent_id) {
    insertData.assigned_to_id = config.dedicated_agent_id;
    const { data: agentProfile } = await admin
      .from("profiles").select("full_name").eq("id", config.dedicated_agent_id).single();
    if (agentProfile) {
      insertData.assigned_to = agentProfile.full_name;
      insertData.assigned_at = new Date().toISOString();
    }
  }
  if (config.dedicated_team_id) {
    insertData.assigned_team_id = config.dedicated_team_id;
    const { data: team } = await admin
      .from("teams").select("name").eq("id", config.dedicated_team_id).single();
    if (team) insertData.assigned_team = team.name;
  }

  const { data: newConv, error: convError } = await admin
    .from("conversations").insert(insertData).select("id").single();

  if (convError) {
    console.error(`Conv create failed: ${convError.message}`);
    return null;
  }
  return newConv.id;
}

/* ─── Body extraction from raw IMAP text ─── */

function extractAndDecodeBody(rawBody: string, headers: Record<string, string>): string {
  const contentType = headers["content-type"] || "";
  const cte = (headers["content-transfer-encoding"] || "").toLowerCase().trim();
  const charsetMatch = contentType.match(/charset=["']?([^;"'\s]+)/i);
  const charset = charsetMatch ? charsetMatch[1] : "utf-8";

  let body = rawBody;

  // Handle multipart
  const boundaryMatch = contentType.match(/boundary=["']?([^;"'\s]+)/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    body = extractFromMultipart(rawBody, boundary);
  }

  // Decode transfer encoding
  if (cte === "base64") {
    body = decodeBase64Body(body, charset);
  } else if (cte === "quoted-printable") {
    body = decodeQuotedPrintable(body);
    if (charset.toLowerCase() !== "utf-8") {
      try {
        const bytes = new Uint8Array([...body].map(c => c.charCodeAt(0)));
        body = new TextDecoder(charset).decode(bytes);
      } catch {}
    }
  }

  // If HTML, convert to text
  if (contentType.includes("text/html") || body.includes("<html") || body.includes("<body") || body.includes("<div")) {
    body = htmlToText(body);
  }

  body = decodeMimeWords(body);
  return body;
}

function extractFromMultipart(raw: string, boundary: string): string {
  const parts = raw.split(`--${boundary}`);
  let textPlain = "";
  let textHtml = "";

  for (const part of parts) {
    if (part.trim() === "--" || part.trim() === "") continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    const altEnd = part.indexOf("\n\n");
    const splitIdx = headerEnd !== -1 ? headerEnd : altEnd;
    if (splitIdx === -1) continue;

    const partHeaders = part.substring(0, splitIdx).toLowerCase();
    const partBody = part.substring(splitIdx + (headerEnd !== -1 ? 4 : 2));

    // Check for nested multipart
    const nestedBoundary = partHeaders.match(/boundary=["']?([^;"'\s]+)/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested) return nested;
    }

    let decoded = partBody;
    if (partHeaders.includes("base64")) {
      const charsetM = partHeaders.match(/charset=["']?([^;"'\s]+)/i);
      decoded = decodeBase64Body(partBody, charsetM ? charsetM[1] : "utf-8");
    } else if (partHeaders.includes("quoted-printable")) {
      decoded = decodeQuotedPrintable(partBody);
      const charsetM = partHeaders.match(/charset=["']?([^;"'\s]+)/i);
      if (charsetM && charsetM[1].toLowerCase() !== "utf-8") {
        try {
          const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
          decoded = new TextDecoder(charsetM[1]).decode(bytes);
        } catch {}
      }
    }

    if (partHeaders.includes("text/plain")) {
      textPlain = decoded;
    } else if (partHeaders.includes("text/html")) {
      textHtml = htmlToText(decoded);
    }
  }

  return textPlain || textHtml;
}

/* ─── Fetch emails for a single config ─── */

async function fetchEmailsForConfig(
  admin: any, config: any, orgId: string,
): Promise<{ fetched: number; errors: string[] }> {
  const errors: string[] = [];
  let fetched = 0;

  if (!config.imap_host || !config.imap_port) {
    errors.push(`Config ${config.id}: Missing IMAP host/port`);
    return { fetched, errors };
  }

  const client = new RawImapClient(
    config.imap_host, config.imap_port,
    config.smtp_username, config.smtp_password,
  );

  try {
    await client.connect();
    await client.login();
    console.log(`[email-fetch] Connected to ${config.imap_host} for ${config.email_address}`);

    const totalMessages = await client.selectInbox();
    console.log(`[email-fetch] INBOX has ${totalMessages} messages`);

    if (totalMessages === 0) {
      await client.disconnect();
      return { fetched: 0, errors };
    }

    // Determine which messages to fetch
    let messageIds: number[] = [];
    if (config.sync_mode === "all") {
      const start = Math.max(1, totalMessages - 99);
      messageIds = Array.from({ length: totalMessages - start + 1 }, (_, i) => start + i);
    } else {
      try {
        messageIds = await client.searchUnseen();
      } catch (e: any) {
        console.log(`[email-fetch] Search failed, using last 20:`, e.message);
        const start = Math.max(1, totalMessages - 19);
        messageIds = Array.from({ length: totalMessages - start + 1 }, (_, i) => start + i);
      }
    }

    if (messageIds.length === 0) {
      console.log(`[email-fetch] No new messages for ${config.email_address}`);
      await client.disconnect();
      return { fetched: 0, errors };
    }

    const toFetch = messageIds.slice(-30);
    console.log(`[email-fetch] Fetching ${toFetch.length} messages`);

    const seqSet = toFetch.join(",");
    const messages = await client.fetchMessages(seqSet);

    for (const msg of messages) {
      try {
        const headers = msg.headers || {};
        const fromRaw = headers["from"] || "";
        const toRaw = headers["to"] || "";
        const ccRaw = headers["cc"] || "";
        const subject = decodeMimeWords(headers["subject"]) || "(بدون عنوان)";
        const emailMessageId = (headers["message-id"] || "").replace(/[<>]/g, "").trim() || `imap-${msg.seq}-${Date.now()}`;
        const dateStr = headers["date"] || "";
        const date = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

        // Parse From header
        const fromMatch = fromRaw.match(/(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?/);
        const senderEmail = fromMatch ? fromMatch[2].trim() : "unknown@unknown.com";
        const senderName = decodeMimeWords(fromMatch?.[1]?.trim()) || senderEmail;
        const toDecoded = decodeMimeWords(toRaw);
        const ccDecoded = decodeMimeWords(ccRaw);

        // Skip own emails
        if (senderEmail.toLowerCase() === config.email_address.toLowerCase()) continue;

        // Dedup
        const { data: existing } = await admin
          .from("messages").select("id")
          .eq("wa_message_id", emailMessageId).limit(1).maybeSingle();
        if (existing) continue;

        const inReplyTo = (headers["in-reply-to"] || "").replace(/[<>]/g, "").trim();
        const refsRaw = (headers["references"] || "").trim();

        const convId = await findOrCreateConversation(
          admin, orgId, senderEmail, senderName, subject,
          emailMessageId, inReplyTo, refsRaw, date, config,
        );
        if (!convId) {
          errors.push(`Could not find/create conversation for ${senderEmail}`);
          continue;
        }

        // Extract and decode body
        let bodyText = extractAndDecodeBody(msg.bodyText || "", headers);
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
            email_references: refsRaw || undefined,
          },
        });

        if (msgError) {
          errors.push(`Msg save failed: ${msgError.message}`);
          continue;
        }

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

    await client.disconnect();
    console.log(`[email-fetch] Done for ${config.email_address}: fetched=${fetched} errors=${errors.length}`);
  } catch (e: any) {
    errors.push(`IMAP error for ${config.email_address}: ${e.message}`);
    console.error(`[email-fetch] IMAP error:`, e.message);
    try { await client.disconnect(); } catch (_) {}
  }

  return { fetched, errors };
}

/* ─── Main handler ─── */

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
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      orgId = profile.org_id;
      try { const body = await req.json(); configId = body?.config_id; } catch (_) {}
    }

    let query = admin.from("email_configs").select("*")
      .eq("is_active", true).not("imap_host", "is", null).neq("imap_host", "");
    if (orgId) query = query.eq("org_id", orgId);
    if (configId) query = query.eq("id", configId);

    const { data: configs, error: configError } = await query;

    if (configError) {
      console.error("[email-fetch] Config query error:", configError);
      return new Response(JSON.stringify({ error: configError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        config_id: config.id, email: config.email_address,
        fetched: result.fetched, errors: result.errors,
      });
    }

    const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    return new Response(JSON.stringify({
      success: true, total_fetched: totalFetched,
      total_errors: totalErrors, results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[email-fetch] ERROR:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
