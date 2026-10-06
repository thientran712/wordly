import { getUserFast } from "@/lib/get-user-fast";
import { createSign } from "crypto";

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
// Same word/phrase gets spoken repeatedly (retrying pronunciation in Học từ
// mới, replaying an AI reply, re-translating the same word) — synthesizing
// via Google TTS takes ~1s every time despite producing byte-identical
// output. Cache by exact (voice, text) key, capped to avoid unbounded growth.
const audioCache = new Map();
const AUDIO_CACHE_MAX_ENTRIES = 500;

function cacheAudio(key, buffer) {
  if (audioCache.size >= AUDIO_CACHE_MAX_ENTRIES) {
    audioCache.delete(audioCache.keys().next().value); // evict oldest
  }
  audioCache.set(key, buffer);
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, lang = "en-US" } = await request.json();
  if (!text?.trim()) return Response.json({ error: "Missing text" }, { status: 400 });
  if (text.length > 500) return Response.json({ error: "Text too long" }, { status: 400 });

  const trimmedText = text.trim();
  const voiceName = VOICE_BY_LANG[lang] || VOICE_BY_LANG["en-US"];
  const cacheKey = `${voiceName}::${trimmedText}`;

  const cached = audioCache.get(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400" },
    });
  }

  try {
    const accessToken = await getAccessToken();

    const ttsRes = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: trimmedText },
        voice: { languageCode: lang, name: voiceName },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json();
      return Response.json({ error: err.error?.message || "TTS failed" }, { status: 500 });
    }

    const { audioContent } = await ttsRes.json();
    const audio = Buffer.from(audioContent, "base64");
    cacheAudio(cacheKey, audio);

    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
