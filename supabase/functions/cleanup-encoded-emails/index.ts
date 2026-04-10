import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodeSingleMimeWord(charset: string, encoding: string, encoded: string): string {
  try {
    if (encoding.toUpperCase() === "B") {
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
  let result = text.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, cs1, enc1, data1, cs2, enc2, data2) => {
      if (cs1.toLowerCase() === cs2.toLowerCase() && enc1.toUpperCase() === enc2.toUpperCase()) {
        return `=?${cs1}?${enc1}?${data1}${data2}?=`;
      }
      return decodeSingleMimeWord(cs1, enc1, data1) + decodeSingleMimeWord(cs2, enc2, data2);
    }
  );
  result = result.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=\s*=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, cs1, enc1, data1, cs2, enc2, data2) => {
      if (cs1.toLowerCase() === cs2.toLowerCase() && enc1.toUpperCase() === enc2.toUpperCase()) {
        return `=?${cs1}?${enc1}?${data1}${data2}?=`;
      }
      return decodeSingleMimeWord(cs1, enc1, data1) + decodeSingleMimeWord(cs2, enc2, data2);
    }
  );
  result = result.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_match, charset, encoding, encoded) => decodeSingleMimeWord(charset, encoding, encoded)
  );
  return result;
}

function decodeQuotedPrintableContent(text: string): string {
  let decoded = text.replace(/=\r?\n/g, "");
  decoded = decoded.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  try {
    const bytes = new Uint8Array([...decoded].map(c => c.charCodeAt(0)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decoded;
  }
}

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ext = getExternalClient();

    // Find messages with encoded subjects/content in conversations table
    const { data: convs, error: convErr } = await ext
      .from("conversations")
      .select("id, customer_name, last_message")
      .or("customer_name.like.%=?%?=%,last_message.like.%=?%?=%")
      .limit(500);

    if (convErr) throw convErr;

    let fixedConvs = 0;
    for (const c of convs || []) {
      const newName = decodeMimeWords(c.customer_name);
      const newMsg = decodeMimeWords(c.last_message);
      if (newName !== c.customer_name || newMsg !== c.last_message) {
        const updates: Record<string, string> = {};
        if (newName !== c.customer_name) updates.customer_name = newName;
        if (newMsg !== c.last_message) updates.last_message = newMsg;
        await ext.from("conversations").update(updates).eq("id", c.id);
        fixedConvs++;
      }
    }

    // Find messages with encoded content (MIME words or raw QP)
    const { data: msgs, error: msgErr } = await ext
      .from("messages")
      .select("id, content")
      .or("content.like.%=?%?=%,content.like.%=d8=%,content.like.%=d9=%")
      .limit(1000);

    if (msgErr) throw msgErr;

    let fixedMsgs = 0;
    for (const m of msgs || []) {
      let decoded = decodeMimeWords(m.content);
      // Also decode raw quoted-printable patterns (=XX=XX)
      if (/=[0-9a-fA-F]{2}=[0-9a-fA-F]{2}/.test(decoded)) {
        decoded = decodeQuotedPrintableContent(decoded);
      }
      if (decoded !== m.content) {
        await ext.from("messages").update({ content: decoded }).eq("id", m.id);
        fixedMsgs++;
      }
    }

    // Also fix email_message_details subjects
    const { data: details } = await ext
      .from("email_message_details")
      .select("id, email_subject")
      .like("email_subject", "%=?%?=%")
      .limit(500);

    let fixedDetails = 0;
    for (const d of details || []) {
      const decoded = decodeMimeWords(d.email_subject);
      if (decoded !== d.email_subject) {
        await ext.from("email_message_details").update({ email_subject: decoded }).eq("id", d.id);
        fixedDetails++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fixed_conversations: fixedConvs,
        fixed_messages: fixedMsgs,
        fixed_email_details: fixedDetails,
        scanned_conversations: convs?.length || 0,
        scanned_messages: msgs?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
