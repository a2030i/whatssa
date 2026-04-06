import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Find messages with encoded content
    const { data: msgs, error: msgErr } = await ext
      .from("messages")
      .select("id, content")
      .like("content", "%=?%?=%")
      .limit(1000);

    if (msgErr) throw msgErr;

    let fixedMsgs = 0;
    for (const m of msgs || []) {
      const decoded = decodeMimeWords(m.content);
      if (decoded !== m.content) {
        await ext.from("messages").update({ content: decoded }).eq("id", m.id);
        fixedMsgs++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fixed_conversations: fixedConvs,
        fixed_messages: fixedMsgs,
        scanned_conversations: convs?.length || 0,
        scanned_messages: msgs?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Cleanup error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});