// Quyền Pro từ App Store: xác thực giao dịch StoreKit 2 (POST /api/billing/sync)
// và App Store Server Notifications V2 (POST /api/billing/notifications).
// Spec 2026-10-16 §4, §8.
//
// Chữ ký JWS do thư viện CHÍNH THỨC của Apple kiểm (SignedDataVerifier,
// xem ./apple-verifier.js); ở đây chỉ có logic thuần + `verify`/`apply` tiêm
// vào → test được mọi loại sự kiện mà không gọi Apple thật.

export const BUNDLE_ID = "com.thientran.wordly";
export const APP_APPLE_ID = 6819743393;
export const PRODUCT_IDS = new Set(["wordly.pro.monthly", "wordly.pro.yearly"]);
// Thiếu mốc hết ân hạn (bất thường — Apple luôn gửi kèm renewal info) → giả
// định 16 ngày (mức Apple đề xuất) để người đang trả tiền không mất Pro oan.
export const DEFAULT_GRACE_MS = 16 * 86_400_000;
const ENVIRONMENTS = ["Production", "Sandbox"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Loại thông báo làm đổi quyền Pro. Loại khác (TEST, PRICE_INCREASE,
// CONSUMPTION_REQUEST…) → 200, không làm gì.
const HANDLED = new Set([
  "SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_STATUS", "DID_FAIL_TO_RENEW",
  "GRACE_PERIOD_EXPIRED", "EXPIRED", "REFUND", "REVOKE",
  // Cùng cách tính từ giao dịch kèm theo — thiếu thì trạng thái lệch thật
  "DID_CHANGE_RENEWAL_PREF", "OFFER_REDEEMED", "RENEWAL_EXTENDED", "REFUND_REVERSED",
]);
const ENDS_GRACE = new Set(["GRACE_PERIOD_EXPIRED", "EXPIRED", "DID_RENEW", "SUBSCRIBED", "REFUND", "REVOKE"]);

export const OTHER_ACCOUNT_BODY = Object.freeze({
  error: "Gói Pro này đang gắn với một tài khoản Wordly khác. Hãy đăng nhập đúng tài khoản đã mua.",
  code: "subscription_other_account",
});
const INVALID = (error) => ({ status: 400, body: { error, code: "invalid_transaction" } });
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

/** Payload JWS KHÔNG xác thực — chỉ để biết chọn verifier môi trường nào. */
export function peekJwsPayload(jws) {
  if (typeof jws !== "string") return null;
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

const METHODS = {
  transaction: "verifyAndDecodeTransaction",
  renewal: "verifyAndDecodeRenewalInfo",
  notification: "verifyAndDecodeNotification",
};

/**
 * Xác thực JWS bằng verifier đúng môi trường. Sandbox (TestFlight, tài khoản
 * Sandbox) và Production đều nhận — môi trường được lưu vào entitlements.
 * JWS ghi rõ môi trường → chỉ dùng verifier đó (verifier tự kiểm khớp);
 * không rõ → thử Production rồi Sandbox.
 */
export async function verifyAppleJws(jws, what, getVerifier) {
  const p = peekJwsPayload(jws);
  const env = what === "notification" ? p?.data?.environment : p?.environment;
  const order = ENVIRONMENTS.includes(env) ? [env] : ENVIRONMENTS;
  let lastError;
  for (const e of order) {
    try {
      return await getVerifier(e)[METHODS[what]](jws);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function autoRenewOf({ renewal, type, subtype }) {
  if (renewal && renewal.autoRenewStatus != null) return Number(renewal.autoRenewStatus) === 1;
  if (subtype === "AUTO_RENEW_DISABLED" || type === "EXPIRED") return false;
  if (subtype === "AUTO_RENEW_ENABLED") return true;
  return null;
}

/**
 * Dòng entitlements từ giao dịch (+ renewal info, loại thông báo) Apple đã
 * xác thực. Mọi mốc so với `now` của SERVER.
 *  - bị hoàn tiền/thu hồi → hết hạn tại revocationDate (không bao giờ cấp Pro)
 *  - ân hạn thanh toán → in_grace + grace_expires_at (vẫn Pro tới mốc đó)
 */
export function entitlementFromApple({ tx, renewal = null, type = null, subtype = null, now = new Date(), eventAt }) {
  const base = {
    source: "app_store",
    product_id: tx.productId ?? null,
    original_transaction_id: tx.originalTransactionId != null ? String(tx.originalTransactionId) : null,
    environment: tx.environment ?? null,
    event_at: iso(eventAt ?? tx.signedDate ?? now.getTime()),
  };

  const revokedAt = tx.revocationDate ?? (type === "REFUND" || type === "REVOKE" ? (eventAt ?? now.getTime()) : null);
  if (revokedAt != null) {
    const end = tx.expiresDate != null ? Math.min(tx.expiresDate, revokedAt) : revokedAt;
    return { ...base, expires_at: iso(end), in_grace: false, grace_expires_at: null, auto_renew: false };
  }

  const graceEnd = renewal?.gracePeriodExpiresDate ?? null;
  const graceSignal = (type === "DID_FAIL_TO_RENEW" && subtype === "GRACE_PERIOD")
    || (graceEnd != null && graceEnd > now.getTime());
  const inGrace = graceSignal && !ENDS_GRACE.has(type);
  return {
    ...base,
    expires_at: iso(tx.expiresDate),
    in_grace: inGrace,
    grace_expires_at: inGrace ? iso(graceEnd ?? (tx.expiresDate ?? now.getTime()) + DEFAULT_GRACE_MS) : null,
    auto_renew: autoRenewOf({ renewal, type, subtype }),
  };
}

function checkTransactionShape(tx) {
  if (!tx || tx.bundleId !== BUNDLE_ID) return INVALID("Giao dịch không thuộc ứng dụng Wordly.");
  if (!PRODUCT_IDS.has(tx.productId)) return INVALID("Gói không hợp lệ.");
  return null;
}

/**
 * POST /api/billing/sync — app gửi signedTransactionInfo sau khi mua/khôi phục.
 * Trả { status: 200 } hoặc { status, body } lỗi (§8 + yêu cầu an toàn tiền):
 *  - sai chữ ký / bundle khác / sản phẩm lạ / thiếu appAccountToken → 400
 *  - appAccountToken là người khác, hoặc giao dịch đã gắn tài khoản khác → 409
 *    (KHÔNG chuyển/nhân đôi gói âm thầm)
 *  - giao dịch đã hết hạn (không bị thu hồi) → không ghi: sync chỉ để CẤP
 *    quyền sau khi mua; hạ cấp do thông báo của Apple lo (tránh xoá nhầm ân hạn)
 */
export async function syncTransaction({ signedTransaction, userId, verify, apply, now = new Date() }) {
  if (typeof signedTransaction !== "string" || !signedTransaction || signedTransaction.length > 20_000) {
    return INVALID("Thiếu signed_transaction.");
  }
  let tx;
  try {
    tx = await verify(signedTransaction, "transaction");
  } catch (e) {
    console.warn("[billing/sync] JWS không hợp lệ:", e?.message || e);
    return INVALID("Không xác thực được giao dịch với App Store.");
  }
  const bad = checkTransactionShape(tx);
  if (bad) return bad;
  const token = typeof tx.appAccountToken === "string" ? tx.appAccountToken.toLowerCase() : "";
  if (!UUID_RE.test(token)) return INVALID("Giao dịch thiếu mã tài khoản Wordly.");
  if (token !== String(userId).toLowerCase()) return { status: 409, body: OTHER_ACCOUNT_BODY };

  const row = entitlementFromApple({ tx, now, eventAt: tx.signedDate });
  const active = new Date(row.expires_at).getTime() > now.getTime();
  if (!active && tx.revocationDate == null) return { status: 200, applied: "expired_ignored" };

  const result = await apply(userId, row);
  if (result === "other_account") return { status: 409, body: OTHER_ACCOUNT_BODY };
  return { status: 200, applied: result };
}

/**
 * POST /api/billing/notifications — App Store Server Notifications V2.
 * Sai chữ ký → 400. Hợp lệ nhưng không liên quan / không tìm được người /
 * lặp lại / tới trễ → 200 (Apple thôi gửi lại). Lỗi DB thật → 500 (Apple gửi lại).
 */
export async function handleNotification({ signedPayload, verify, apply, findUserByOtid, now = new Date() }) {
  if (typeof signedPayload !== "string" || !signedPayload) return { status: 400, body: { error: "Thiếu signedPayload" } };
  let payload, tx, renewal = null;
  try {
    payload = await verify(signedPayload, "notification");
  } catch (e) {
    console.warn("[billing/notifications] JWS không hợp lệ:", e?.message || e);
    return { status: 400, body: { error: "Chữ ký không hợp lệ" } };
  }
  const type = payload?.notificationType;
  const subtype = payload?.subtype ?? null;
  const data = payload?.data;
  if (!HANDLED.has(type) || !data?.signedTransactionInfo) return { status: 200, ignored: type || "unknown" };

  try {
    tx = await verify(data.signedTransactionInfo, "transaction");
    if (data.signedRenewalInfo) renewal = await verify(data.signedRenewalInfo, "renewal");
  } catch (e) {
    console.warn("[billing/notifications] JWS lồng bên trong không hợp lệ:", e?.message || e);
    return { status: 400, body: { error: "Chữ ký không hợp lệ" } };
  }
  if (checkTransactionShape(tx)) return { status: 200, ignored: "product" };

  const token = typeof tx.appAccountToken === "string" ? tx.appAccountToken.toLowerCase() : "";
  const userId = UUID_RE.test(token) ? token : await findUserByOtid(String(tx.originalTransactionId));
  if (!userId) {
    console.warn(`[billing/notifications] ${type}: không tìm được người dùng cho giao dịch ${tx.originalTransactionId}`);
    return { status: 200, ignored: "no_user" };
  }

  const row = entitlementFromApple({ tx, renewal, type, subtype, now, eventAt: payload.signedDate });
  try {
    const result = await apply(userId, row);
    if (result === "other_account") {
      console.warn(`[billing/notifications] ${type}: giao dịch ${tx.originalTransactionId} đã gắn tài khoản khác — bỏ qua`);
    }
    return { status: 200, applied: result };
  } catch (e) {
    // Người dùng đã xoá tài khoản (FK) → không bao giờ ghi được, đừng để Apple gửi lại mãi
    if (e?.code === "23503") return { status: 200, ignored: "user_deleted" };
    console.error(`[billing/notifications] ${type}: ghi entitlement lỗi:`, e?.message || e);
    return { status: 500, body: { error: "Lỗi máy chủ" } };
  }
}
