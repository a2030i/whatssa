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
  const { data: profile } = await userClient
    .from("profiles")
    .select("id, org_id, full_name")
    .limit(1)
    .maybeSingle();
  return profile;
}

/** Try to insert into email_message_details; silently skip if table doesn't exist */
async function insertEmailDetails(admin: any, details: Record<string, any>) {
  try {
    await admin.from("email_message_details").insert(details);
  } catch (e: any) {
    console.warn("[email-send] email_message_details insert skipped:", e.message);
  }
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

    const { to, cc, bcc, subject, body: emailBody, config_id, conversation_id, attachments } = await req.json();
    
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
      // Queue for later delivery when email is configured
      let convId = conversation_id || null;
      if (convId) {
        await admin.from("messages").insert({
          conversation_id: convId,
          sender: "agent",
          content: `📧 ${subject}\n\n${emailBody.replace(/<[^>]*>/g, "").trim()}`,
          message_type: "text",
          status: "pending",
          metadata: { queued: true, queued_at: new Date().toISOString(), email_subject: subject, email_to: to, sent_by: profile.id },
        });
      }

      await admin.from("message_retry_queue").insert({
        org_id: profile.org_id,
        conversation_id: convId,
        to_phone: to,
        content: emailBody,
        message_type: "text",
        channel_type: "email",
        last_error: "لا يوجد إعداد بريد إلكتروني نشط",
        metadata: { subject, cc: cc || null, bcc: bcc || null, config_id: config_id || null, attachments: attachments || [] },
      });

      return new Response(JSON.stringify({ success: true, queued: true, message: "الرسالة في قائمة الانتظار - سيتم إرسالها عند تفعيل البريد" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = configs;
    console.log(`[email-send] Sending from ${config.email_address} to ${to}`);

    // ── Threading: find original email Message-ID to reply in-thread ──
    let inReplyTo = "";
    let references = "";
    let threadSubject = subject;

    if (conversation_id) {
      // Try email_message_details first, fallback to metadata
      const { data: detailMsgs } = await admin
        .from("email_message_details")
        .select("email_message_id, email_references, email_subject")
        .eq("conversation_id", conversation_id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(5);

      let found = false;
      if (detailMsgs && detailMsgs.length > 0) {
        for (const d of detailMsgs) {
          if (d.email_message_id) {
            inReplyTo = d.email_message_id.startsWith("<") ? d.email_message_id : `<${d.email_message_id}>`;
            references = d.email_references ? `${d.email_references} ${inReplyTo}` : inReplyTo;
            const origSubject = d.email_subject || subject;
            threadSubject = origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`;
            found = true;
            break;
          }
        }
      }

      // Fallback to metadata for backwards compatibility
      if (!found) {
        const { data: threadMsgs } = await admin
          .from("messages")
          .select("metadata, wa_message_id")
          .eq("conversation_id", conversation_id)
          .eq("sender", "customer")
          .order("created_at", { ascending: false })
          .limit(5);

        if (threadMsgs && threadMsgs.length > 0) {
          for (const msg of threadMsgs) {
            const meta = msg.metadata as Record<string, any> | null;
            const msgId = meta?.email_message_id || msg.wa_message_id;
            if (msgId) {
              inReplyTo = msgId.startsWith("<") ? msgId : `<${msgId}>`;
              const existingRefs = meta?.email_references || "";
              references = existingRefs ? `${existingRefs} ${inReplyTo}` : inReplyTo;
              const origSubject = meta?.email_subject || subject;
              threadSubject = origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`;
              break;
            }
          }
        }
      }
    }

    // Generate a unique Message-ID for this outgoing email
    const domain = config.email_address.split("@")[1] || "respondly.app";
    const outgoingMessageId = `<${crypto.randomUUID()}@${domain}>`;

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

    // Build custom headers for threading
    const customHeaders: Record<string, string> = {
      "Message-ID": outgoingMessageId,
    };
    if (inReplyTo) {
      customHeaders["In-Reply-To"] = inReplyTo;
      customHeaders["References"] = references || inReplyTo;
    }

    const attachmentNames: string[] = (attachments && Array.isArray(attachments))
      ? attachments.map((a: any) => a.filename)
      : [];

    // Append org signature if configured
    const signature = config.email_signature;
    // Convert plain-text newlines to <br> so email clients render line breaks
    const isPlainText = !emailBody.includes("<") || !emailBody.includes(">");
    const bodyHtml = isPlainText ? emailBody.replace(/\n/g, "<br>") : emailBody;

    let finalBody = emailBody;
    let finalHtml = bodyHtml;
    if (signature) {
      const sigHtml = `<br><br><div style="border-top:1px solid #ccc;padding-top:8px;margin-top:16px;color:#666;font-size:13px;white-space:pre-line">${signature.replace(/\n/g, "<br>")}</div>`;
      finalBody = emailBody + "\n\n--\n" + signature;
      finalHtml = bodyHtml + sigHtml;
    }

    const sendOptions: any = {
      from: config.email_address,
      to,
      subject: threadSubject,
      content: finalBody,
      html: finalHtml,
      headers: customHeaders,
    };
    if (cc) sendOptions.cc = cc;
    if (bcc) sendOptions.bcc = bcc;

    // Handle attachments
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      sendOptions.attachments = attachments.map((att: any) => {
        const binaryStr = atob(att.content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        return {
          filename: att.filename,
          content: bytes,
          contentType: att.contentType || "application/octet-stream",
        };
      });
      console.log(`[email-send] Sending with ${attachments.length} attachment(s)`);
    }

    await client.send(sendOptions);
    await client.close();
    console.log(`[email-send] Email sent successfully to ${to} (thread: ${inReplyTo ? "reply" : "new"})`);

    // Create or update conversation for this email
    let convId = conversation_id;
    if (!convId) {
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
        const { data: newConv, error: convError } = await admin
          .from("conversations")
          .insert({
            org_id: profile.org_id,
            customer_phone: to,
            customer_name: to,
            conversation_type: "email",
            status: "active",
            last_message: `📧 ${threadSubject}`,
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

    // Save sent message + email details
    if (convId) {
      const plainBody = emailBody.replace(/<[^>]*>/g, "").trim();
      const subjectNorm = threadSubject.replace(/^Re:\s*/i, "").trim();

      let displayContent: string;
      if (attachmentNames.length > 0) {
        const bodyPart = subjectNorm === plainBody ? plainBody : `📧 ${threadSubject}\n\n${plainBody}`;
        displayContent = `📎 ${attachmentNames.join(", ")}${plainBody ? `\n\n${bodyPart}` : ""}`;
      } else {
        displayContent = subjectNorm === plainBody ? plainBody : `📧 ${threadSubject}\n\n${plainBody}`;
      }

      const { data: insertedMsg } = await admin.from("messages").insert({
        conversation_id: convId,
        sender: "agent",
        content: displayContent,
        message_type: "text",
        status: "sent",
        wa_message_id: outgoingMessageId,
        metadata: {
          email_subject: threadSubject,
          email_from: config.email_address,
          email_to: to,
          email_cc: cc || null,
          email_bcc: bcc || null,
          email_message_id: outgoingMessageId,
          email_in_reply_to: inReplyTo || null,
          email_references: references || null,
          email_attachments: attachmentNames.length > 0 ? attachmentNames : null,
          sent_by: profile.id,
          sent_by_name: profile.full_name,
        },
      }).select("id").single();

      // Insert into email_message_details table
      if (insertedMsg?.id) {
        await insertEmailDetails(admin, {
          message_id: insertedMsg.id,
          conversation_id: convId,
          org_id: profile.org_id,
          email_subject: threadSubject,
          email_from: config.email_address,
          email_to: to,
          email_cc: cc || null,
          email_bcc: bcc || null,
          email_message_id: outgoingMessageId,
          email_in_reply_to: inReplyTo || null,
          email_references: references || null,
          email_attachments: attachmentNames.length > 0 ? attachmentNames.map(n => ({ filename: n })) : [],
          sent_by: profile.id,
          sent_by_name: profile.full_name,
          direction: "outbound",
        });
      }

      await admin.from("conversations").update({
        last_message: `📧 ${threadSubject}`,
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
