import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createJwt(audience: string, subject: string, privateKeyD: string, publicKeyRaw: string) {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 43200, sub: subject };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;

  // Import private key
  const pubBytes = base64UrlDecode(publicKeyRaw);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: privateKeyD,
    x: base64UrlEncode(pubBytes.slice(1, 33)),
    y: base64UrlEncode(pubBytes.slice(33, 65)),
  };

  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));

  // Convert DER to raw r||s (64 bytes)
  const sigBytes = new Uint8Array(sig);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  } else {
    // DER format
    let offset = 2;
    const rLen = sigBytes[offset + 1];
    offset += 2;
    const rRaw = sigBytes.slice(offset, offset + rLen);
    offset += rLen;
    const sLen = sigBytes[offset + 1];
    offset += 2;
    const sRaw = sigBytes.slice(offset, offset + sLen);
    r = rRaw.length > 32 ? rRaw.slice(rRaw.length - 32) : rRaw;
    s = sRaw.length > 32 ? sRaw.slice(sRaw.length - 32) : sRaw;
    // Pad if needed
    if (r.length < 32) { const p = new Uint8Array(32); p.set(r, 32 - r.length); r = p; }
    if (s.length < 32) { const p = new Uint8Array(32); p.set(s, 32 - s.length); s = p; }
  }
  const rawSig = new Uint8Array(64);
  rawSig.set(r, 0);
  rawSig.set(s, 32);

  return `${unsigned}.${base64UrlEncode(rawSig.buffer)}`;
}

async function encryptPayload(payload: string, p256dh: string, auth: string) {
  // Generate local ECDH key pair
  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPublicRaw = await crypto.subtle.exportKey("raw", localKeys.publicKey);

  // Import subscriber public key
  const subPubBytes = base64UrlDecode(p256dh);
  const subPubKey = await crypto.subtle.importKey("raw", subPubBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: subPubKey }, localKeys.privateKey, 256);

  const authBytes = base64UrlDecode(auth);
  const enc = new TextEncoder();

  // PRK_key = HKDF-Extract(auth_secret, shared_secret)
  const prkKeyMaterial = await crypto.subtle.importKey("raw", authBytes, { name: "HKDF" }, false, ["deriveBits"]);

  // Build info for content encryption key
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // IKM = HKDF(auth, sharedSecret, "WebPush: info" || 0x00 || ua_pub || as_pub, 32)
  const infoPrefix = enc.encode("WebPush: info\0");
  const keyInfo = new Uint8Array(infoPrefix.length + 65 + 65);
  keyInfo.set(infoPrefix, 0);
  keyInfo.set(subPubBytes, infoPrefix.length);
  keyInfo.set(new Uint8Array(localPublicRaw), infoPrefix.length + 65);

  const ikmKey = await crypto.subtle.importKey("raw", sharedSecret, { name: "HKDF" }, false, ["deriveBits"]);
  const ikm = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authBytes, info: keyInfo },
    ikmKey, 256
  );

  // CEK = HKDF(salt, IKM, "Content-Encoding: aes128gcm" || 0x00, 16)
  const cekInfo = enc.encode("Content-Encoding: aes128gcm\0");
  const ikmKey2 = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const cekBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: cekInfo },
    ikmKey2, 128
  );

  // Nonce = HKDF(salt, IKM, "Content-Encoding: nonce" || 0x00, 12)
  const nonceInfo = enc.encode("Content-Encoding: nonce\0");
  const ikmKey3 = await crypto.subtle.importKey("raw", ikm, { name: "HKDF" }, false, ["deriveBits"]);
  const nonceBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt, info: nonceInfo },
    ikmKey3, 96
  );

  // Encrypt with AES-128-GCM
  const cek = await crypto.subtle.importKey("raw", cekBits, "AES-GCM", false, ["encrypt"]);
  const payloadBytes = enc.encode(payload);
  // Add padding: delimiter + padding
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes, 0);
  padded[payloadBytes.length] = 2; // delimiter

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonceBits }, cek, padded);

  // Build aes128gcm body: salt(16) + rs(4) + idlen(1) + keyid(65) + encrypted
  const localPub = new Uint8Array(localPublicRaw);
  const rs = 4096;
  const header2 = new Uint8Array(16 + 4 + 1 + 65);
  header2.set(salt, 0);
  new DataView(header2.buffer).setUint32(16, rs);
  header2[20] = 65;
  header2.set(localPub, 21);

  const body = new Uint8Array(header2.length + encrypted.byteLength);
  body.set(header2, 0);
  body.set(new Uint8Array(encrypted), header2.length);

  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const extServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(extUrl, extServiceKey);

    const { user_ids, org_id, title, body: msgBody, url, tag } = await req.json();

    // Get VAPID keys from system_settings
    const { data: pubSetting } = await admin.from("system_settings").select("value").eq("key", "vapid_public_key").maybeSingle();
    const { data: privSetting } = await admin.from("system_settings").select("value").eq("key", "vapid_private_key").maybeSingle();
    const { data: subjectSetting } = await admin.from("system_settings").select("value").eq("key", "vapid_subject").maybeSingle();

    if (!pubSetting?.value || !privSetting?.value) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 400, headers: corsHeaders });
    }

    const vapidPublicKey = pubSetting.value;
    const vapidPrivateKey = privSetting.value;
    const vapidSubject = subjectSetting?.value || "mailto:admin@whatssa.lovable.app";

    // Get subscriptions
    let query = admin.from("push_subscriptions").select("*");
    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    } else if (org_id) {
      query = query.eq("org_id", org_id);
    }
    const { data: subs } = await query;

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload = JSON.stringify({ title, body: msgBody, url: url || "/inbox", tag: tag || "notification" });

    let sent = 0;
    let failed = 0;
    const failedEndpoints: string[] = [];

    for (const sub of subs) {
      try {
        const endpoint = sub.endpoint;
        const aud = new URL(endpoint).origin;

        const jwt = await createJwt(aud, vapidSubject, vapidPrivateKey, vapidPublicKey);
        const encryptedBody = await encryptPayload(payload, sub.p256dh, sub.auth_key);

        const resp = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": "86400",
            "Urgency": "high",
          },
          body: encryptedBody,
        });

        if (resp.status === 201 || resp.status === 200) {
          sent++;
        } else if (resp.status === 410 || resp.status === 404) {
          // Subscription expired, remove it
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
          failed++;
        } else {
          failed++;
          failedEndpoints.push(`${resp.status}: ${await resp.text()}`);
        }
      } catch (e) {
        failed++;
        failedEndpoints.push(e.message);
      }
    }

    return new Response(JSON.stringify({ sent, failed, total: subs.length, errors: failedEndpoints.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
