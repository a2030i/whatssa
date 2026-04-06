import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

async function getCallerOrgId(authHeader: string | null) {
  if (!authHeader) return null;

  const url = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const anonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: profile } = await userClient
    .from("profiles")
    .select("org_id")
    .limit(1)
    .maybeSingle();

  return profile?.org_id || null;
}

/**
 * Test SMTP connection by opening a socket to the SMTP server.
 * We use Deno.connect for a lightweight connectivity check.
 */
async function testSmtp(host: string, port: number, encryption: string): Promise<{ ok: boolean; message: string; latency_ms: number }> {
  const start = Date.now();
  try {
    let conn: Deno.Conn;

    if (encryption === "ssl" || (encryption === "tls" && port === 465)) {
      // Direct TLS connection (SSL / implicit TLS on port 465)
      conn = await Deno.connectTls({ hostname: host, port });
    } else {
      // Plain connection first (STARTTLS on port 587/25)
      conn = await Deno.connect({ hostname: host, port });
    }

    // Read the SMTP greeting (first line)
    const buf = new Uint8Array(512);
    const n = await conn.read(buf);
    conn.close();

    const latency = Date.now() - start;
    if (n && n > 0) {
      const greeting = new TextDecoder().decode(buf.subarray(0, n)).trim();
      if (greeting.startsWith("220")) {
        return { ok: true, message: `متصل بنجاح — ${host}:${port}`, latency_ms: latency };
      }
      return { ok: false, message: `رد غير متوقع: ${greeting.substring(0, 80)}`, latency_ms: latency };
    }
    return { ok: false, message: "لم يتم استقبال رد من السيرفر", latency_ms: latency };
  } catch (e: any) {
    return { ok: false, message: `فشل الاتصال: ${e.message}`, latency_ms: Date.now() - start };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const orgId = await getCallerOrgId(authHeader);
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { config_id } = await req.json();
    if (!config_id) {
      return new Response(JSON.stringify({ error: "config_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = getExternalClient();
    const { data: config, error } = await admin
      .from("email_configs")
      .select("smtp_host, smtp_port, encryption, email_address")
      .eq("id", config_id)
      .eq("org_id", orgId)
      .single();

    if (error || !config) {
      return new Response(JSON.stringify({ error: "Email config not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await testSmtp(config.smtp_host, config.smtp_port, config.encryption);

    // Update is_verified status
    if (result.ok) {
      await admin
        .from("email_configs")
        .update({ is_verified: true })
        .eq("id", config_id)
        .eq("org_id", orgId);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
