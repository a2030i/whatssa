import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// 1x1 transparent GIF
const PIXEL_BYTES = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), c => c.charCodeAt(0));

function getExternalClient() {
  return createClient(
    Deno.env.get("EXTERNAL_SUPABASE_URL")!,
    Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  if (!token) {
    return new Response(PIXEL_BYTES, {
      headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache" },
    });
  }

  try {
    const ext = getExternalClient();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ua = req.headers.get("user-agent") || "";

    // Update tracking record
    const { data: existing } = await ext
      .from("email_open_tracking")
      .select("id, open_count")
      .eq("tracking_token", token)
      .maybeSingle();

    if (existing) {
      await ext.from("email_open_tracking").update({
        opened_at: existing.opened_at || new Date().toISOString(),
        open_count: (existing.open_count || 0) + 1,
        ip_address: ip,
        user_agent: ua,
      }).eq("id", existing.id);
    }
  } catch (e) {
    console.error("[tracking-pixel] Error:", (e as Error).message);
  }

  return new Response(PIXEL_BYTES, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
});
