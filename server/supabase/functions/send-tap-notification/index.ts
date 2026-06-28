// Supabase Edge Function: send-tap-notification
// Triggered by a Database Webhook on tap_logs INSERT.
// Sends FCM push notifications to the user whose NFC ring was tapped.

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// FCM v1 HTTP API endpoint
// @ts-ignore
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") ?? "";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`;

serve(async (req: Request): Promise<Response> => {
  try {
    // 1. Parse the webhook payload (Database Webhook sends the new row)
    const payload = await req.json();
    const record = payload.record; // The inserted tap_log row

    if (!record || !record.user_id) {
      return new Response(JSON.stringify({ error: "No record" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only notify on approved taps
    if (record.approved === false) {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Create Supabase client (service_role to bypass RLS)
    // @ts-ignore
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    // @ts-ignore
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Fetch user's active FCM tokens
    const { data: tokens, error } = await supabase
      .from("device_tokens")
      .select("fcm_token")
      .eq("user_id", record.user_id)
      .eq("is_active", true);

    if (error || !tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No active tokens",
          user_id: record.user_id,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Get OAuth2 access token for FCM v1 API
    const accessToken = await getFCMAccessToken();

    // 5. Send notification to each device
    const results = await Promise.allSettled(
      tokens.map((t: { fcm_token: string }) =>
        sendFCM(accessToken, t.fcm_token, {
          title: "NFC Tap Detected 🏷️",
          body: record.reader_label
            ? `You tapped at ${record.reader_label}`
            : "Your NFC ring was just tapped",
          data: {
            type: "nfc_tap",
            tap_id: record.id ?? "",
            profile_link: record.profile_link ?? "",
            tapped_at: record.tapped_at ?? "",
            reader_label: record.reader_label ?? "",
          },
        })
      )
    );

    // 6. Deactivate stale tokens
    const staleTokens: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r === undefined) continue;
      if (r.status === "rejected") {
        staleTokens.push(tokens[i].fcm_token);
      } else if (r.status === "fulfilled" && !r.value.ok) {
        staleTokens.push(tokens[i].fcm_token);
      }
    }

    if (staleTokens.length > 0) {
      await supabase
        .from("device_tokens")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .in("fcm_token", staleTokens);
    }

    return new Response(
      JSON.stringify({
        sent: tokens.length - staleTokens.length,
        stale: staleTokens.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Edge function error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

// ─────────────────────────────────────────────────────
// FCM v1 HTTP API helpers
// ─────────────────────────────────────────────────────

interface NotificationPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

async function sendFCM(
  accessToken: string,
  fcmToken: string,
  payload: NotificationPayload
): Promise<Response> {
  return fetch(FCM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: { priority: "HIGH" },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      },
    }),
  });
}

/**
 * Get a short-lived OAuth2 access token for FCM v1 API
 * using a Google Service Account (JWT → token exchange).
 */
async function getFCMAccessToken(): Promise<string> {
  // @ts-ignore
  const serviceAccountEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "";
  // @ts-ignore
  const rawKey = Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "";
  const privateKeyPem = rawKey.replace(/\\n/g, "\n");

  // Create JWT header and claims
  const now = Math.floor(Date.now() / 1000);

  const headerB64 = base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
  const claimsB64 = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signInput = `${headerB64}.${claimsB64}`;

  // Import private key and sign
  const keyData = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/[\r\n\s]/g, "");

  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const signatureB64 = base64UrlEncodeBytes(new Uint8Array(signature));
  const jwt = `${signInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error(
      `FCM token exchange failed: ${JSON.stringify(tokenData)}`
    );
  }

  return tokenData.access_token;
}

// ─────────────────────────────────────────────────────
// Base64URL encoding (required by JWT spec — no padding, URL-safe chars)
// ─────────────────────────────────────────────────────

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
