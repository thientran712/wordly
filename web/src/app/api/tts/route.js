import { getUserFast } from "@/lib/auth/get-user-fast";
import { createSign } from "crypto";
import { ttsCacheKey, getOrCreateAudio, limitedSynthesize, TtsRateLimitedError } from "@/lib/storage/tts-cache";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjectBytes, putObjectBytes } from "@/lib/storage/r2-client";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

const VOICE_BY_LANG = {
  "en-US": "en-US-Neural2-D",
  "en-GB": "en-GB-Neural2-D",
  "vi-VN": "vi-VN-Neural2-A",
};

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── OAuth token cache ────────────────────────────────────────────────────
// Google's tokens are valid for 1h; re-minting a JWT and hitting the OAuth
// endpoint on every single TTS request added ~70-270ms of pure overhead for
// no reason. Cache the token at module scope (survives across requests in
// the same server instance) and only refresh a minute before it expires.
let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const privateKey = Buffer.from(process.env.GOOGLE_TTS_PRIVATE_KEY_BASE64 || "", "base64").toString("utf8");
  const clientEmail = process.env.GOOGLE_TTS_CLIENT_EMAIL;

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const sig = base64url(sign.sign(privateKey));
  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get Google access token");

  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000 - 60_000; // refresh 1min early
  return cachedToken;
}

// ── Audio cache ──────────────────────────────────────────────────────────
// Cùng một từ/câu được đọc lại nhiều lần nhưng audio giống hệt nhau. RAM của
// instance là tầng 1 (gần như luôn trống trên serverless), R2 là tầng bền
// dùng chung — xem lib/storage/tts-cache.js. Header X-TTS-Cache cho biết
// audio lấy từ đâu (memory | r2 | google) để kiểm chứng.
const audioCache = new Map();

// ── Hạn mức gọi Google (chặn chi phí trong app) ─────────────────────────
// Chỉ tính lần CACHE MISS — phát lại từ đã cache không tốn tiền nên không
// giới hạn. Mỗi người: 30 lần/phút (chặn gọi dồn), 300 lần/ngày (trần chi
// phí: tối đa ~150k ký tự/người/ngày). Một buổi luyện nói 30 phút ≈ 60 câu.
const TTS_LIMITS = [
  { scope: "tts-google-min", limit: 30, windowMs: 60_000 },
  { scope: "tts-google-day", limit: 300, windowMs: 86_400_000 },
];
const r2Store = {
  get: (key) => getObjectBytes(key),
  put: (key, bytes) => putObjectBytes(key, bytes, "audio/mpeg"),
};

async function synthesize(text, lang, voiceName) {
  const accessToken = await getAccessToken();
  const ttsRes = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: lang, name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
    }),
  });
  if (!ttsRes.ok) {
    const err = await ttsRes.json().catch(() => ({}));
    throw new Error(err.error?.message || "TTS failed");
  }
  const { audioContent } = await ttsRes.json();
  return Buffer.from(audioContent, "base64");
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, lang = "en-US" } = await request.json();
  if (!text?.trim()) return Response.json({ error: "Missing text" }, { status: 400 });
  if (text.length > 500) return Response.json({ error: "Text too long" }, { status: 400 });

  const trimmedText = text.trim();
  const voiceName = VOICE_BY_LANG[lang] || VOICE_BY_LANG["en-US"];

  try {
    const { audio, source } = await getOrCreateAudio({
      key: ttsCacheKey(voiceName, trimmedText),
      memory: audioCache,
      store: r2Store,
      synthesize: limitedSynthesize({
        checks: TTS_LIMITS.map(({ scope, limit, windowMs }) => () =>
          checkRateLimitDb({ supabase: createAdminClient(), scope, clientKey: `u:${user.id}`, limit, windowMs })
        ),
        synthesize: () => synthesize(trimmedText, lang, voiceName),
      }),
    });
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-TTS-Cache": source,
      },
    });
  } catch (err) {
    if (err instanceof TtsRateLimitedError) {
      return rateLimitResponse(err.result, "Bạn nghe phát âm quá nhiều trong thời gian ngắn. Vui lòng thử lại sau.");
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}
