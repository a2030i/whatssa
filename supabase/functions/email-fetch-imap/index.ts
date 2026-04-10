import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── MIME / Decode helpers ─── */

function decodeSingleMimeWord(charset: string, encoding: string, encoded: string): string {
  try {
    if (encoding.toUpperCase() === "B") {
      // Fix padding if missing
      const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
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

function decodeMimeWords(text: string | null | undefined): string {
  if (!text) return "";
  // First, join adjacent encoded words (RFC 2047: whitespace between them should be ignored)
  let result = text.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, cs1, enc1, data1, cs2, enc2, data2) => {
      // If same charset and encoding, combine the encoded data
      if (cs1.toLowerCase() === cs2.toLowerCase() && enc1.toUpperCase() === enc2.toUpperCase()) {
        return `=?${cs1}?${enc1}?${data1}${data2}?=`;
      }
      return decodeSingleMimeWord(cs1, enc1, data1) + decodeSingleMimeWord(cs2, enc2, data2);
    }
  );
  // Repeat to handle 3+ adjacent words
  result = result.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, cs1, enc1, data1, cs2, enc2, data2) => {
      if (cs1.toLowerCase() === cs2.toLowerCase() && enc1.toUpperCase() === enc2.toUpperCase()) {
        return `=?${cs1}?${enc1}?${data1}${data2}?=`;
      }
      return decodeSingleMimeWord(cs1, enc1, data1) + decodeSingleMimeWord(cs2, enc2, data2);
    }
  );
  // Now decode remaining individual encoded words
  result = result.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset, encoding, encoded) => decodeSingleMimeWord(charset, encoding, encoded)
  );
  return result;
}

function decodeQuotedPrintable(text: string): string {
  // Remove soft line breaks first
  let decoded = text.replace(/=\r?\n/g, "");
  // Decode hex pairs to raw bytes
  decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  // Always try UTF-8 decode for the raw bytes (handles Arabic, etc.)
  try {
    const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decoded;
  }
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
  let text = html
    // Remove <style> and <head> blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    // Remove images with cid: src (inline embedded images)
    .replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*>/gi, "")
    // Remove all other images (signature logos, tracking pixels, etc.)
    .replace(/<img[^>]*>/gi, "")
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
    .replace(/&#\d+;/gi, "");

  // Clean up artifacts that appear after HTML stripping
  text = text
    // Remove cid: image references (e.g. [cid:image001.png@01DCC807.CA254A40])
    .replace(/\[?cid:[^\]\s]+\]?/gi, "")
    // Remove [Description: ...] alt-text placeholders from stripped images
    .replace(/\[Description:\s*[^\]]*\]/gi, "")
    // Clean URLs in angle brackets: "text<http://url>" → "text http://url"
    .replace(/<(https?:\/\/[^>]+)>/gi, " $1")
    // Remove orphaned angle bracket pairs
    .replace(/<([^>]{0,3})>/g, "$1")
    // Remove "P " or "🌿 " environment notice lines
    .replace(/^[P🌿🌱]\s*Please consider the environment.*/gim, "")
    // Collapse multiple spaces
    .replace(/[ \t]{2,}/g, " ")
    // Collapse multiple newlines
    .replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw)\s*:\s*/gi, "")
    .replace(/^\[.*?\]\s*/g, "")
    .trim()
    .toLowerCase();
}

function cleanQuotedContent(body: string): string {
  const lines = body.split("\n");
  let cutIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = (i + 1 < lines.length) ? lines[i + 1]?.trim() : "";

    // Pattern 1: "On <date> <person> wrote:" (Gmail, Apple Mail)
    if (/^On .+ wrote:\s*$/i.test(line)) { cutIndex = i; break; }

    // Pattern 2: "في <date> كتب <person>:" (Arabic Gmail)
    if (/^في .+ كتب .+:\s*$/i.test(line)) { cutIndex = i; break; }

    // Pattern 3: "---- Original Message ----" or "--- Forwarded message ---"
    if (/^-{2,}\s*(Original Message|Forwarded message|رسالة أصلية)\s*-{2,}/i.test(line)) { cutIndex = i; break; }

    // Pattern 4: "___" separator (Outlook)
    if (/^_{3,}\s*$/.test(line)) { cutIndex = i; break; }

    // Pattern 5: "From: xxx" followed by "Sent:" or "Date:" (Outlook header block)
    if (/^From:\s*.+/i.test(line) && /^(Sent|Date|To|Subject|من|إلى|التاريخ):\s*/i.test(nextLine)) { cutIndex = i; break; }

    // Pattern 6: "> " quoted lines block (3+ consecutive lines starting with >)
    if (/^>/.test(line)) {
      let consecutive = 0;
      for (let j = i; j < lines.length && /^>/.test(lines[j].trim()); j++) consecutive++;
      if (consecutive >= 2) { cutIndex = i; break; }
    }

    // Pattern 7: "Le <date>, <person> a écrit :" (French)
    if (/^Le .+ a écrit\s*:\s*$/i.test(line)) { cutIndex = i; break; }

    // Pattern 8: "<date>، <person> <email> كتب:" (Arabic pattern 2)
    if (/كتب[:\s]*$/.test(line) && /</.test(line)) { cutIndex = i; break; }

    // Pattern 9: Outlook "From:" standalone with email
    if (/^From:\s*.*@.+\..+/i.test(line)) { cutIndex = i; break; }
  }

  const cleaned = lines.slice(0, cutIndex).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const result = cleaned || body.replace(/\n{3,}/g, "\n\n").trim();
  return postCleanEmailBody(result);
}

/** Final cleanup pass to remove leftover artifacts from plain-text conversion */
function postCleanEmailBody(text: string): string {
  let cleaned = text
    // Remove cid: references that survived
    .replace(/\[?cid:[^\]\s]+\]?/gi, "")
    // Remove [Description: ...] image alt-text placeholders
    .replace(/\[Description:\s*[^\]]*\]/gi, "")
    // Remove [image: ...] or [Image: ...]
    .replace(/\[image:\s*[^\]]*\]/gi, "")
    // Remove [since YYYY] or similar bracket artifacts from signatures
    .replace(/\[since\s+\d{4}\]/gi, "")
    .replace(/\[est\.?\s*\d{4}\]/gi, "")
    // Clean URLs in angle brackets
    .replace(/<(https?:\/\/[^>]+)>/gi, "$1")
    // Remove "The content of this email is confidential..." disclaimer blocks
    .replace(/The content of this email is confidential[\s\S]{0,500}$/i, "")
    .replace(/هذه الرسالة سرية[\s\S]{0,500}$/i, "")
    .replace(/This email and any attachments[\s\S]{0,500}$/i, "")
    .replace(/DISCLAIMER[\s\S]{0,500}$/i, "")
    .replace(/^.*(?:Please consider the environment|يرجى مراعاة البيئة).*$/gim, "");

  // ── Signature detection: cut text after common signature delimiters ──
  const sigPatterns = [
    /^--\s*$/m,                              // Standard "-- " signature delimiter
    /^_{5,}\s*$/m,                           // _____ line
    /^-{5,}\s*$/m,                           // ----- line
    /^={5,}\s*$/m,                           // ===== line
    /^Sent from my (iPhone|iPad|Galaxy|Android|Huawei|Samsung)/im,
    /^(تم الإرسال من|أُرسل من|مرسل من)\s/im, // Arabic "Sent from"
    /^Get Outlook for/im,
    /^Envoyé depuis/im,                       // French "Sent from"
  ];

  for (const pattern of sigPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined && match.index > 20) {
      cleaned = cleaned.substring(0, match.index);
      break;
    }
  }

  // ── Remove trailing URL-only lines (common in signatures) ──
  // Lines that are just URLs or "www.xxx.com" at the end
  const lines = cleaned.split("\n");
  while (lines.length > 0) {
    const lastLine = lines[lines.length - 1].trim();
    if (!lastLine) { lines.pop(); continue; }
    // Pure URL line
    if (/^(https?:\/\/|www\.)\S+$/i.test(lastLine)) { lines.pop(); continue; }
    // Line that's just a domain like "company.com"
    if (/^[a-z0-9-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(lastLine)) { lines.pop(); continue; }
    // Line that is URL concatenated: "www.xxx.comhttps://www.xxx.com"
    if (/^(www\.|https?:\/\/).*https?:\/\//i.test(lastLine)) { lines.pop(); continue; }
    // Phone/fax number only lines at the end
    if (/^[+\d\s()-]{7,}$/.test(lastLine)) { lines.pop(); continue; }
    // Single word trademark/brand lines (< 30 chars, no spaces or just one word)
    if (lastLine.length < 30 && /^[\w\u0600-\u06FF.-]+$/.test(lastLine) && !/\s/.test(lastLine)) { lines.pop(); continue; }
    break;
  }
  cleaned = lines.join("\n");

  // Collapse multiple spaces and newlines
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
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

   // Strategy 2: Match by normalized subject AND same sender email
  // ONLY if the email has In-Reply-To or References headers (indicates it's a reply)
  // New emails without threading headers always create new conversations
  if (normSubject.length > 0 && (inReplyTo || references)) {
    const { data: convs } = await admin
      .from("conversations").select("id, notes, last_message, customer_phone")
      .eq("org_id", orgId).eq("conversation_type", "email")
      .eq("customer_phone", senderEmail)
      .neq("status", "closed")
      .order("created_at", { ascending: false }).limit(50);

    if (convs) {
      for (const conv of convs) {
        const convSubject = (conv.notes || "").replace(/^📧\s*/, "").trim();
        if (convSubject && normalizeSubject(convSubject) === normSubject) return conv.id;
        const lmSubject = (conv.last_message || "").replace(/^📧\s*/, "").trim();
        if (lmSubject && normalizeSubject(lmSubject) === normSubject) return conv.id;
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

  // Check email routing rules (domain/email pattern matching)
  const senderDomain = senderEmail.split("@")[1]?.toLowerCase() || "";
  const { data: routingRules } = await admin
    .from("email_routing_rules")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("priority", { ascending: false });

  let routeMatched = false;
  if (routingRules && routingRules.length > 0) {
    for (const rule of routingRules) {
      const pattern = (rule.pattern || "").toLowerCase().trim();
      const matched = rule.rule_type === "domain"
        ? senderDomain === pattern || senderDomain.endsWith(`.${pattern}`)
        : senderEmail.toLowerCase() === pattern;
      if (matched) {
        if (rule.assigned_agent_id) {
          insertData.assigned_to_id = rule.assigned_agent_id;
          const { data: agentProfile } = await admin
            .from("profiles").select("full_name").eq("id", rule.assigned_agent_id).single();
          if (agentProfile) {
            insertData.assigned_to = agentProfile.full_name;
            insertData.assigned_at = new Date().toISOString();
          }
        }
        if (rule.assigned_team_id) {
          insertData.assigned_team_id = rule.assigned_team_id;
          const { data: team } = await admin
            .from("teams").select("name").eq("id", rule.assigned_team_id).single();
          if (team) insertData.assigned_team = team.name;
        }
        routeMatched = true;
        break;
      }
    }
  }

  // Fallback to config-level dedicated agent/team
  if (!routeMatched) {
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

interface ExtractedAttachment {
  filename: string;
  contentType: string;
  size?: number;
}

function extractAndDecodeBody(rawBody: string, headers: Record<string, string>): { text: string; attachments: ExtractedAttachment[] } {
  const contentType = headers["content-type"] || "";
  const cte = (headers["content-transfer-encoding"] || "").toLowerCase().trim();
  const charsetMatch = contentType.match(/charset=["']?([^;"'\s]+)/i);
  const charset = charsetMatch ? charsetMatch[1] : "utf-8";

  let body = rawBody;
  let attachments: ExtractedAttachment[] = [];

  // Handle multipart
  const boundaryMatch = contentType.match(/boundary=["']?([^;"'\s]+)/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const result = extractFromMultipart(rawBody, boundary);
    body = result.text;
    attachments = result.attachments;
  } else {
    // Decode transfer encoding
    if (cte === "base64") {
      body = decodeBase64Body(body, charset);
    } else if (cte === "quoted-printable") {
      body = decodeQuotedPrintable(body);
      try {
        const bytes = new Uint8Array([...body].map(c => c.charCodeAt(0)));
        body = new TextDecoder(charset).decode(bytes);
      } catch {}
    }

    // If HTML, convert to text
    if (contentType.includes("text/html") || body.includes("<html") || body.includes("<body") || body.includes("<div")) {
      body = htmlToText(body);
    }
  }

  body = decodeMimeWords(body);
  return { text: body, attachments };
}

function extractFromMultipart(raw: string, boundary: string): { text: string; attachments: ExtractedAttachment[] } {
  const parts = raw.split(`--${boundary}`);
  let textPlain = "";
  let textHtml = "";
  const attachments: ExtractedAttachment[] = [];

  for (const part of parts) {
    if (part.trim() === "--" || part.trim() === "") continue;

    const headerEnd = part.indexOf("\r\n\r\n");
    const altEnd = part.indexOf("\n\n");
    const splitIdx = headerEnd !== -1 ? headerEnd : altEnd;
    if (splitIdx === -1) continue;

    const partHeaders = part.substring(0, splitIdx);
    const partHeadersLower = partHeaders.toLowerCase();
    const partBody = part.substring(splitIdx + (headerEnd !== -1 ? 4 : 2));

    // Check for nested multipart
    const nestedBoundary = partHeadersLower.match(/boundary=["']?([^;"'\s]+)/i);
    if (nestedBoundary) {
      const nested = extractFromMultipart(partBody, nestedBoundary[1]);
      if (nested.text) textPlain = textPlain || nested.text;
      attachments.push(...nested.attachments);
      continue;
    }

    // Check if this part is an attachment
    const dispositionMatch = partHeaders.match(/Content-Disposition:\s*(attachment|inline)/i);
    const filenameMatch = partHeaders.match(/filename[*]?=["']?(?:UTF-8''|utf-8'')?([^"';\r\n]+)/i);
    const contentTypeMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
    const partCt = contentTypeMatch ? contentTypeMatch[1].trim().toLowerCase() : "";

    if (filenameMatch || (dispositionMatch && dispositionMatch[1].toLowerCase() === "attachment")) {
      const filename = filenameMatch ? decodeURIComponent(filenameMatch[1].trim()) : "attachment";
      attachments.push({
        filename: decodeMimeWords(filename),
        contentType: partCt || "application/octet-stream",
        size: partBody.trim().length, // approximate
      });
      continue;
    }

    // Skip image parts that are inline (signatures, etc.)
    if (partCt.startsWith("image/") && !filenameMatch) continue;

    let decoded = partBody;
    if (partHeadersLower.includes("base64")) {
      const charsetM = partHeadersLower.match(/charset=["']?([^;"'\s]+)/i);
      decoded = decodeBase64Body(partBody, charsetM ? charsetM[1] : "utf-8");
    } else if (partHeadersLower.includes("quoted-printable")) {
      decoded = decodeQuotedPrintable(partBody);
      const charsetM = partHeadersLower.match(/charset=["']?([^;"'\s]+)/i);
      try {
        const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
        decoded = new TextDecoder(charsetM ? charsetM[1] : "utf-8").decode(bytes);
      } catch {}
    }

    if (partCt.includes("text/plain") || partHeadersLower.includes("text/plain")) {
      textPlain = decoded;
    } else if (partCt.includes("text/html") || partHeadersLower.includes("text/html")) {
      textHtml = htmlToText(decoded);
    }
  }

  return { text: textPlain || textHtml, attachments };
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

    const toFetch = messageIds.slice(-100);
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
        const extracted = extractAndDecodeBody(msg.bodyText || "", headers);
        let bodyText = extracted.text;
        const emailAttachments = extracted.attachments;
        const cleanBody = cleanQuotedContent(bodyText);
        const displayContent = cleanBody.substring(0, 10000) || subject || "(بدون محتوى)";

        // Build display content with attachment info
        let finalDisplayContent = displayContent;
        if (emailAttachments.length > 0) {
          const attachNames = emailAttachments.map(a => a.filename).join(", ");
          finalDisplayContent = `📎 ${attachNames}\n\n${displayContent}`;
        }

        // Insert message
        const { data: insertedMsg, error: msgError } = await admin.from("messages").insert({
          conversation_id: convId,
          sender: "customer",
          content: finalDisplayContent,
          message_type: "text",
          status: "received",
          wa_message_id: emailMessageId,
          created_at: date,
          metadata: {
            email_subject: subject,
            email_from: senderEmail,
            email_from_name: senderName,
            email_to: toDecoded || config.email_address,
            email_cc: ccDecoded || undefined,
            email_message_id: emailMessageId,
            imap_fetched: true,
            email_in_reply_to: inReplyTo || undefined,
            email_references: refsRaw || undefined,
            email_attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
          },
        }).select("id").single();

        if (msgError) {
          errors.push(`Msg save failed: ${msgError.message}`);
          continue;
        }

        // Insert into email_message_details (dedicated table)
        if (insertedMsg?.id) {
          try {
            await admin.from("email_message_details").insert({
              message_id: insertedMsg.id,
              conversation_id: convId,
              org_id: orgId,
              email_subject: subject,
              email_from: senderEmail,
              email_from_name: senderName,
              email_to: toDecoded || config.email_address,
              email_cc: ccDecoded || null,
              email_message_id: emailMessageId,
              email_in_reply_to: inReplyTo || null,
              email_references: refsRaw || null,
              email_attachments: emailAttachments.length > 0 ? emailAttachments : [],
              direction: "inbound",
              created_at: date,
            });
          } catch (detailErr: any) {
            console.warn("[email-fetch] email_message_details insert skipped:", detailErr.message);
          }
        }

        await admin.from("conversations").update({
          last_message: cleanBody.substring(0, 200) || subject,
          last_message_at: date,
          last_message_sender: "customer",
          customer_name: senderName,
          customer_phone: senderEmail,
          updated_at: new Date().toISOString(),
        }).eq("id", convId);

        // ── Email Automation Rules: domain + keyword → assign / ticket ──
        try {
          const emailDomain = senderEmail.split("@")[1]?.toLowerCase() || "";
          const { data: autoRules } = await admin
            .from("email_routing_rules")
            .select("*")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("priority", { ascending: false });

          if (autoRules && autoRules.length > 0) {
            const subjectLower = (subject || "").toLowerCase();
            const bodyLower = (cleanBody || "").toLowerCase();

            for (const rule of autoRules) {
              // Check domain match
              const pattern = (rule.pattern || "").toLowerCase().trim();
              const domainMatch = rule.rule_type === "domain"
                ? emailDomain === pattern || emailDomain.endsWith(`.${pattern}`)
                : senderEmail.toLowerCase() === pattern;
              if (!domainMatch) continue;

              // Check keyword match (if keywords specified, ALL must match in subject or body)
              const ruleKeywords: string[] = rule.keywords || [];
              if (ruleKeywords.length > 0) {
                const allMatch = ruleKeywords.every((kw: string) => {
                  const kwLower = kw.toLowerCase().trim();
                  return subjectLower.includes(kwLower) || bodyLower.includes(kwLower);
                });
                if (!allMatch) continue;
              }

              // Check attachment type filter
              const ruleAttachTypes: string[] = rule.attachment_types || [];
              if (ruleAttachTypes.length > 0) {
                const emailAttachments: any[] = msg.attachments || [];
                const hasMatchingAttachment = emailAttachments.some((a: any) => {
                  const filename = (a.filename || "").toLowerCase();
                  return ruleAttachTypes.some((ext: string) => filename.endsWith(`.${ext.toLowerCase()}`));
                });
                if (!hasMatchingAttachment) continue;
              }

              const actionType = rule.action_type || "assign";

              // Action: assign agent/team
              if (actionType === "assign" || actionType === "assign_and_ticket") {
                const updateData: Record<string, any> = {};
                if (rule.assigned_agent_id) {
                  updateData.assigned_to_id = rule.assigned_agent_id;
                  const { data: ap } = await admin.from("profiles").select("full_name").eq("id", rule.assigned_agent_id).single();
                  if (ap) { updateData.assigned_to = ap.full_name; updateData.assigned_at = new Date().toISOString(); }
                }
                if (rule.assigned_team_id) {
                  updateData.assigned_team_id = rule.assigned_team_id;
                  const { data: tm } = await admin.from("teams").select("name").eq("id", rule.assigned_team_id).single();
                  if (tm) updateData.assigned_team = tm.name;
                }
                if (Object.keys(updateData).length > 0) {
                  await admin.from("conversations").update(updateData).eq("id", convId);
                }
              }

              // Action: create ticket
              if (actionType === "ticket" || actionType === "assign_and_ticket") {
                const ticketTitle = rule.ticket_title_template
                  ? rule.ticket_title_template.replace(/\{\{subject\}\}/gi, subject).replace(/\{\{sender\}\}/gi, senderName)
                  : subject;

                // Use ticket-specific assignment, fall back to conversation assignment
                const ticketAgentId = rule.ticket_assigned_agent_id || rule.assigned_agent_id || null;
                const ticketTeamId = rule.ticket_assigned_team_id || rule.assigned_team_id || null;

                const ticketData: Record<string, any> = {
                  org_id: orgId,
                  conversation_id: convId,
                  customer_phone: senderEmail,
                  customer_name: senderName,
                  title: ticketTitle,
                  description: cleanBody.substring(0, 2000),
                  status: "open",
                  priority: rule.ticket_priority || "medium",
                  category: rule.ticket_category || "general",
                  assigned_to: ticketAgentId,
                  metadata: {
                    source: "email_automation",
                    rule_id: rule.id,
                    email_subject: subject,
                    email_from: senderEmail,
                  },
                };

                if (ticketTeamId) {
                  ticketData.team_id = ticketTeamId;
                }

                // Include attachments info if enabled — filter by type if specified
                if (rule.include_attachments !== false) {
                  let attachments: any[] = msg.attachments || [];
                  if (ruleAttachTypes.length > 0) {
                    attachments = attachments.filter((a: any) => {
                      const filename = (a.filename || "").toLowerCase();
                      return ruleAttachTypes.some((ext: string) => filename.endsWith(`.${ext.toLowerCase()}`));
                    });
                  }
                  if (attachments.length > 0) {
                    ticketData.metadata.attachments = attachments.map((a: any) => ({
                      filename: a.filename || "attachment",
                      content_type: a.contentType || "application/octet-stream",
                    }));
                  }
                }

                await admin.from("tickets").insert(ticketData);
                console.log(`[email-automation] Created ticket for rule ${rule.id}: "${ticketTitle}"`);
              }

              break; // First matching rule wins
            }
          }
        } catch (autoErr: any) {
          console.warn("[email-automation] Rule processing error:", autoErr.message);
        }

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
