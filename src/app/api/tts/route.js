import { getUserFast } from "@/lib/get-user-fast";
import { createSign } from "crypto";

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

function base64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getAccessToken() {
  const privateKey = process.env.GOOGLE_TTS_PRIVATE_KEY.replace(/\\n/g, "\n");
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
  return data.access_token;
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { text, lang = "en-US" } = await request.json();
  if (!text?.trim()) return Response.json({ error: "Missing text" }, { status: 400 });
  if (text.length > 500) return Response.json({ error: "Text too long" }, { status: 400 });

  try {
    const accessToken = await getAccessToken();

    const ttsRes = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: text.trim() },
        voice: {
          languageCode: lang,
          name: lang === "en-US" ? "en-US-Neural2-D" : "vi-VN-Neural2-A",
        },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.json();
      return Response.json({ error: err.error?.message || "TTS failed" }, { status: 500 });
    }

    const { audioContent } = await ttsRes.json();
    const audio = Buffer.from(audioContent, "base64");

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
