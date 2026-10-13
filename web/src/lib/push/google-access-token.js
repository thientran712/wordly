// Service account → access token OAuth2 của Google cho FCM HTTP v1.
// Token sống 1 giờ; cache tới 5 phút trước khi hết hạn. Dùng jose (đã có),
// không thêm google-auth-library / firebase-admin.
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const EARLY_REFRESH_MS = 5 * 60 * 1000;

export function createGoogleTokenProvider({ serviceAccount, fetchImpl = fetch, clock = () => Date.now() }) {
  let cached = null;
  let expiresAt = 0;

  return {
    async get() {
      if (cached && clock() < expiresAt - EARLY_REFRESH_MS) return cached;
      const key = await importPKCS8(serviceAccount.private_key, "RS256");
      const iat = Math.floor(clock() / 1000);
      const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(serviceAccount.client_email)
        .setAudience(TOKEN_URL)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 3600)
        .sign(key);
      const res = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) throw new Error(`google token: ${res.status} ${data.error || ""}`.trim());
      cached = data.access_token;
      expiresAt = clock() + (data.expires_in || 3600) * 1000;
      return cached;
    },
    invalidate() {
      cached = null;
      expiresAt = 0;
    },
  };
}
