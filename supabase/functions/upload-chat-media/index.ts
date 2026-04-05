import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// External Supabase (data, auth, storage — primary)
const EXT_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const EXT_ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const EXT_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

// Lovable Cloud (fallback for legacy files only)
const CLOUD_URL = Deno.env.get("SUPABASE_URL")!;
const CLOUD_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Reuse admin client across requests (single connection pool)
const extAdmin = createClient(EXT_URL, EXT_SERVICE, {
  auth: { persistSession: false },
  db: { schema: "public" },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "-");

const BUCKET = "chat-media";
let bucketEnsured = false;

/** Ensure the chat-media bucket exists on external storage (runs once per cold start) */
async function ensureBucket(client: ReturnType<typeof createClient>) {
  if (bucketEnsured) return;
  try {
    const { data } = await client.storage.getBucket(BUCKET);
    if (!data) {
      await client.storage.createBucket(BUCKET, { public: false });
      console.log("chat-media bucket created on external storage");
    }
    bucketEnsured = true;
  } catch (e) {
    // Bucket may already exist — ignore "already exists" errors
    if (String(e).includes("already exists")) {
      bucketEnsured = true;
    } else {
      console.error("ensureBucket error:", e);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(EXT_URL, EXT_ANON, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    // ── Sign action: generate signed URL ──
    if (body?.action === "sign" && body?.path) {
      // 1) Try external storage (primary — where new files go)
      const { data, error: signErr } = await extAdmin.storage
        .from(BUCKET)
        .createSignedUrl(body.path, 3600);
      if (data?.signedUrl) return json({ signedUrl: data.signedUrl });

      // 2) Fallback: try Lovable Cloud (legacy files)
      if (CLOUD_URL !== EXT_URL) {
        const cloudClient = createClient(CLOUD_URL, CLOUD_SERVICE);
        const { data: cloudData } = await cloudClient.storage
          .from(BUCKET)
          .createSignedUrl(body.path, 3600);
        if (cloudData?.signedUrl) return json({ signedUrl: cloudData.signedUrl });
      }

      return json({ error: signErr?.message || "فشل توليد الرابط" }, 400);
    }

    // ── Upload action ──
    const {
      conversation_id,
      file_name,
      content_type,
      base64,
    }: {
      conversation_id?: string;
      file_name?: string;
      content_type?: string;
      base64?: string;
    } = body || {};

    if (!conversation_id || !base64 || !content_type) {
      return json({ error: "بيانات الملف غير مكتملة" }, 400);
    }

    const allowedPrefixes = ["audio/", "image/", "video/", "application/pdf", "application/vnd.", "application/msword", "application/octet-stream", "text/"];
    const isAllowed = allowedPrefixes.some(p => content_type.startsWith(p));
    if (!isAllowed) {
      return json({ error: "نوع الملف غير مدعوم" }, 400);
    }

    const maxSize = content_type.startsWith("audio/") ? 20 : 50;
    if (base64.length > maxSize * 1024 * 1024) {
      return json({ error: `حجم الملف كبير جداً (الحد الأقصى ${maxSize}MB)` }, 400);
    }

    const [{ data: profile }, { data: conversation }, { data: isSuperAdmin }] = await Promise.all([
      extAdmin.from("profiles").select("org_id").eq("id", user.id).maybeSingle().abortSignal(AbortSignal.timeout(8000)),
      extAdmin.from("conversations").select("id, org_id").eq("id", conversation_id).maybeSingle().abortSignal(AbortSignal.timeout(8000)),
      extAdmin.rpc("has_role", { _user_id: user.id, _role: "super_admin" }).abortSignal(AbortSignal.timeout(8000)),
    ]);

    if (!profile?.org_id) {
      return json({ error: "لا توجد مؤسسة مرتبطة بهذا الحساب" }, 400);
    }

    if (!conversation) {
      return json({ error: "المحادثة غير موجودة" }, 404);
    }

    if (!isSuperAdmin && conversation.org_id !== profile.org_id) {
      return json({ error: "غير مصرح لك برفع هذا الملف" }, 403);
    }

    // Ensure bucket exists on external storage before upload
    await ensureBucket(extAdmin);

    const extension = sanitizeFileName(file_name || "voice-note.webm").split(".").pop() || "webm";
    const objectPath = `${conversation_id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

    const { error: uploadError } = await extAdmin.storage
      .from(BUCKET)
      .upload(objectPath, binary, {
        contentType: content_type,
        upsert: false,
      });

    if (uploadError) {
      console.error("upload-chat-media error:", uploadError);
      return json({ error: uploadError.message || "فشل رفع الملف" }, 400);
    }

    return json({
      success: true,
      storage_path: `storage:chat-media/${objectPath}`,
    });
  } catch (error) {
    console.error("upload-chat-media fatal:", error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع" }, 500);
  }
});
