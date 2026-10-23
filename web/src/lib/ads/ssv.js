// Xác thực phía server (SSV) thưởng quảng cáo của AdMob (spec 2026-10-23).
// Google gọi GET /api/ads/reward-callback?…&signature=…&key_id=… sau khi
// người dùng xem xong quảng cáo thưởng. Nội dung được ký = phần query TRƯỚC
// `&signature=` (giữ nguyên dạng mã hoá URL), chữ ký ECDSA P-256 / SHA-256
// dạng DER, base64url. App không tự cộng lượt được: chỉ callback này cấp thưởng.
import { verify } from "node:crypto";

const KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
const KEYS_TTL_MS = 24 * 3_600_000;
// Chữ ký giả có key_id lạ cũng gây "tải lại" — chặn tối đa 1 lần/phút để
// không ai dùng route này dồn request tới Google qua server mình.
const REFRESH_GAP_MS = 60_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THEME_RE = /^[a-z0-9_-]{1,64}$/;

/** `keys`: [{ keyId, pem }] từ verifier-keys.json. */
export function verifySsvSignature(rawQuery, keys) {
  const q = String(rawQuery ?? "");
  const at = q.indexOf("&signature=");
  if (at <= 0) return false;
  const content = q.slice(0, at);
  const tail = new URLSearchParams(q.slice(at + 1));
  const sig = tail.get("signature");
  const keyId = Number(tail.get("key_id"));
  const key = (keys ?? []).find((k) => Number(k.keyId) === keyId);
  if (!sig || !key) return false;
  try {
    return verify("sha256", Buffer.from(content), { key: key.pem, dsaEncoding: "der" }, Buffer.from(sig, "base64url"));
  } catch {
    return false;
  }
}

/** custom_data = "translate" | "theme:<id>"; user_id = UUID người dùng Wordly. */
export function parseReward(params) {
  const transactionId = params.get("transaction_id")?.trim();
  const userId = params.get("user_id")?.trim().toLowerCase();
  const data = params.get("custom_data")?.trim() ?? "";
  if (!transactionId || transactionId.length > 200 || !userId || !UUID_RE.test(userId)) return null;
  if (data === "translate") return { transactionId, userId, kind: "translate", themeId: null };
  const m = /^theme:(.+)$/.exec(data);
  if (m && THEME_RE.test(m[1])) return { transactionId, userId, kind: "theme", themeId: m[1] };
  return null;
}

let cached = { keys: null, at: 0 };

/** Khoá công khai của Google, nhớ 24 giờ; `refresh` = tải lại (gặp key_id lạ). */
export async function fetchVerifierKeys({ refresh = false } = {}) {
  const age = Date.now() - cached.at;
  if (cached.keys && age < (refresh ? REFRESH_GAP_MS : KEYS_TTL_MS)) return cached.keys;
  const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`verifier-keys ${res.status}`);
  const body = await res.json();
  const keys = (body?.keys ?? []).map((k) => ({ keyId: Number(k.keyId), pem: k.pem }));
  cached = { keys, at: Date.now() };
  return keys;
}

const reply = (status, body) => ({ status, body });

/**
 * Xử lý một callback. 200 = Google ngừng gọi lại (đã cấp / trùng / không có
 * gì để cấp); 400 = chữ ký sai; 500 = lỗi tạm (Google gọi lại sau).
 */
export async function handleRewardCallback({ rawQuery, getKeys, grant, rewardCredits }) {
  let ok;
  try {
    ok = verifySsvSignature(rawQuery, await getKeys());
    if (!ok) ok = verifySsvSignature(rawQuery, await getKeys({ refresh: true }));
  } catch (e) {
    console.error("[ads/ssv] tải khoá lỗi:", e?.message || e);
    return reply(500, { error: "keys unavailable" });
  }
  if (!ok) return reply(400, { error: "bad signature" });

  const reward = parseReward(new URLSearchParams(rawQuery));
  if (!reward) return reply(200, { ok: true, granted: false });

  try {
    const result = await grant({
      p_transaction_id: reward.transactionId, p_user_id: reward.userId, p_kind: reward.kind,
      p_theme_id: reward.themeId, p_credits: rewardCredits,
    });
    return reply(200, { ok: true, result });
  } catch (e) {
    // Người dùng đã xoá tài khoản (FK) → không cấp được nữa, đừng để Google gọi lại mãi
    if (e?.code === "23503") return reply(200, { ok: true, granted: false });
    console.error("[ads/ssv] grant_ad_reward lỗi:", e?.message || e);
    return reply(500, { error: "server error" });
  }
}
