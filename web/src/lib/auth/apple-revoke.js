// Thu hồi token Sign in with Apple khi người dùng xoá tài khoản
// (Apple Guideline 5.1.1(v)).
//
// Luồng: app iOS xin lại authorizationCode từ Apple ngay trước khi xoá →
// server đổi code lấy token (/auth/token) → thu hồi token (/auth/revoke).
// client_secret là JWT ES256 ký bằng key "Sign in with Apple" (.p8).
//
// Mọi phụ thuộc (fetch, now, config) được truyền vào để test được. Hàm không
// bao giờ throw và không bao giờ trả/log code, token hay secret.
import { SignJWT, importPKCS8 } from "jose";

const APPLE_AUDIENCE = "https://appleid.apple.com";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
// client_secret chỉ dùng ngay trong request này — để sống ngắn là đủ.
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export async function buildAppleClientSecret({ teamId, keyId, clientId, privateKeyPem, now }) {
  const key = await importPKCS8(privateKeyPem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_SECRET_TTL_SECONDS)
    .setAudience(APPLE_AUDIENCE)
    .setSubject(clientId)
    .sign(key);
}

async function postForm(fetch, url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  let json = {};
  try {
    json = (await res.json()) ?? {};
  } catch {
    // /auth/revoke trả body rỗng khi thành công — không phải lỗi.
  }
  return { ok: res.ok, status: res.status, json };
}

// Chỉ giữ mã lỗi Apple (vd "invalid_grant"), không giữ gì khác từ response.
function appleError(json, fallback) {
  return typeof json?.error === "string" ? json.error : fallback;
}

export async function revokeAppleAuthorization({ code, config, fetch, now = () => Math.floor(Date.now() / 1000) }) {
  if (!config) return { ok: false, step: "config", status: null, error: "missing_config" };

  let clientSecret;
  try {
    clientSecret = await buildAppleClientSecret({ ...config, now: now() });
  } catch {
    return { ok: false, step: "config", status: null, error: "invalid_private_key" };
  }
  const clientId = config.clientId;

  let token;
  let tokenTypeHint;
  try {
    const res = await postForm(fetch, TOKEN_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });
    if (!res.ok) return { ok: false, step: "token", status: res.status, error: appleError(res.json, "http_error") };
    if (typeof res.json.refresh_token === "string" && res.json.refresh_token) {
      token = res.json.refresh_token;
      tokenTypeHint = "refresh_token";
    } else if (typeof res.json.access_token === "string" && res.json.access_token) {
      token = res.json.access_token;
      tokenTypeHint = "access_token";
    } else {
      return { ok: false, step: "token", status: res.status, error: "no_token" };
    }
  } catch {
    return { ok: false, step: "token", status: null, error: "network_error" };
  }

  try {
    const res = await postForm(fetch, REVOKE_URL, {
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenTypeHint,
    });
    if (!res.ok) return { ok: false, step: "revoke", status: res.status, error: appleError(res.json, "http_error") };
  } catch {
    return { ok: false, step: "revoke", status: null, error: "network_error" };
  }

  return { ok: true };
}

// APPLE_PRIVATE_KEY_BASE64 = base64 của nguyên file .p8 (PEM) — tránh lỗi
// xuống dòng khi đặt PEM nhiều dòng vào biến môi trường.
export function readAppleConfig(env) {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const clientId = env.APPLE_CLIENT_ID;
  const keyBase64 = env.APPLE_PRIVATE_KEY_BASE64;
  if (!teamId || !keyId || !clientId || !keyBase64) return null;
  return {
    teamId,
    keyId,
    clientId,
    privateKeyPem: Buffer.from(keyBase64, "base64").toString("utf8"),
  };
}

// Người dùng từng đăng nhập bằng Apple? Dựa trên user đã xác thực lại với
// Supabase Auth, không tin gì từ client.
export function isAppleUser(user) {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.some((i) => i?.provider === "apple")) return true;
  const meta = user.app_metadata ?? {};
  if (Array.isArray(meta.providers) && meta.providers.includes("apple")) return true;
  return meta.provider === "apple";
}

// Body DELETE /api/account là tuỳ chọn: bản app cũ không gửi gì. Body rỗng,
// hỏng hoặc sai kiểu đều coi như không có code.
export function parseDeleteAccountBody(text) {
  if (!text) return null;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const code = body.appleAuthorizationCode;
  if (typeof code !== "string" || !code.trim()) return null;
  return code.trim();
}

// Quyết định ở tầng route. Dù kết quả thế nào, tài khoản VẪN bị xoá —
// quyền xoá của người dùng không phụ thuộc Apple.
export function decideAppleRevoke({ user, code }) {
  if (!isAppleUser(user)) return { action: "skip" };
  if (!code) return { action: "warn-missing-code" };
  return { action: "revoke", code };
}
