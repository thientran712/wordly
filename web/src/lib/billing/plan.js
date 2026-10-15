// Chính sách gói Wordly Pro — logic thuần (spec 2026-10-16-pro-paywall-design.md
// §1, §3, §8). Tách khỏi route để test được mọi ca không cần DB/Apple.

// Miễn phí: giới hạn để có lý do nâng cấp nhưng vòng thói quen vẫn đủ dùng.
export const FREE_LIMITS = Object.freeze({ saved_words: 30, advanced_translate: 5, dictionary: 5, push_slots: 1 });
// Pro: null = không giới hạn (hợp đồng §8). push_slots 10 = trần sẵn có (MAX_PUSH_SLOTS).
export const PRO_LIMITS = Object.freeze({ saved_words: null, advanced_translate: null, dictionary: null, push_slots: 10 });
// Pro vẫn có trần chống lạm dụng mỗi ngày: một tài khoản bị lộ / script gọi
// liên tục không được đốt tiền AI vô hạn (spec §1).
export const PRO_ABUSE_CAPS = Object.freeze({ sentence: 200, image: 30, voice: 50 });

/**
 * Có quyền Pro tại thời điểm `now` (giờ SERVER — không bao giờ tin giờ máy
 * người dùng). Bản SQL: hàm is_pro trong migration 20261016000200 — sửa cả hai.
 *  - gift không hạn (expires_at null) = Pro vĩnh viễn; app_store luôn có hạn
 *  - đang ân hạn thanh toán (billing grace period) → vẫn Pro tới khi hết ân hạn
 */
export function isPro(entitlement, now = new Date()) {
  if (!entitlement) return false;
  const t = now.getTime();
  if (entitlement.expires_at == null) return entitlement.source === "gift";
  if (new Date(entitlement.expires_at).getTime() > t) return true;
  return Boolean(entitlement.in_grace && entitlement.grace_expires_at
    && new Date(entitlement.grace_expires_at).getTime() > t);
}

/** Mốc hết quyền thật sự hiển thị cho app: trong ân hạn là mốc hết ân hạn. */
export function effectiveExpiry(entitlement) {
  if (!entitlement) return null;
  if (entitlement.in_grace && entitlement.grace_expires_at) return entitlement.grace_expires_at;
  return entitlement.expires_at ?? null;
}

/**
 * Còn thuê bao Apple đang chạy (sẽ còn bị trừ tiền) không — app cảnh báo
 * trước khi xoá tài khoản, vì xoá tài khoản KHÔNG huỷ thuê bao Apple.
 * auto_renew chưa biết (null) → coi như còn, cảnh báo thừa còn hơn thiếu.
 */
export function hasActiveSubscription(entitlement, now = new Date()) {
  return Boolean(entitlement && entitlement.source === "app_store"
    && isPro(entitlement, now) && entitlement.auto_renew !== false);
}

/**
 * App phải cập nhật không. Bản đã phát hành (1.0.0, build 19/20) không gửi
 * `X-Wordly-Build` → khi đang chặn, thiếu header = bản cũ (spec §3).
 */
export function requiresUpdate(buildHeader, minBuild, enforce) {
  if (!enforce) return false;
  const s = String(buildHeader ?? "").trim();
  if (!/^\d+$/.test(s)) return true;
  return Number(s) < (minBuild || 0);
}

/** BILLING_ENFORCE mặc định TẮT: deploy server trước, bật khi bản app có paywall lên store. */
export function billingEnforced(env = process.env) {
  return ["1", "true", "on", "yes"].includes(String(env.BILLING_ENFORCE ?? "").trim().toLowerCase());
}

/** APP_MIN_BUILD (mặc định 0): build thấp hơn → màn "Cập nhật Wordly". */
export function appMinBuild(env = process.env) {
  const n = Number.parseInt(String(env.APP_MIN_BUILD ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Tắt chặn → như Pro (không giới hạn) để app cũ/mới chạy y như hôm nay. */
export function limitsFor({ pro, enforced }) {
  return !enforced || pro ? PRO_LIMITS : FREE_LIMITS;
}

/** Hình trả về của GET /api/billing/status và POST /api/billing/sync (§8). */
export function buildStatus({ entitlement, usage, savedCount, enforced, now = new Date() }) {
  const pro = isPro(entitlement, now);
  const limits = limitsFor({ pro, enforced });
  return {
    pro,
    expires_at: effectiveExpiry(entitlement),
    source: entitlement?.source ?? null,
    in_grace: Boolean(entitlement?.in_grace && pro),
    enforced,
    has_active_subscription: hasActiveSubscription(entitlement, now),
    limits: {
      saved_words: { used: savedCount || 0, limit: limits.saved_words },
      advanced_translate: { used: usage?.advanced_translate || 0, limit: limits.advanced_translate },
      dictionary: { used: usage?.dictionary || 0, limit: limits.dictionary },
      push_slots: { limit: limits.push_slots },
    },
  };
}

const LIMIT_MESSAGES = {
  limit_saved_words: (n) => `Bản miễn phí lưu được tối đa ${n} từ. Nâng cấp Wordly Pro để lưu không giới hạn, hoặc bỏ lưu bớt từ cũ.`,
  limit_advanced_translate: (n) => `Bạn đã dùng hết ${n} lượt dịch câu, ảnh, giọng nói hôm nay. Nâng cấp Wordly Pro để dịch thoải mái.`,
  limit_dictionary: (n) => `Bạn đã tra hết ${n} từ mới hôm nay. Nâng cấp Wordly Pro để tra thoải mái.`,
  limit_push_slots: (n) => `Bản miễn phí có ${n} khung giờ nhắc ôn. Nâng cấp Wordly Pro để thêm tới ${PRO_LIMITS.push_slots} khung giờ.`,
};

// Pro chạm trần chống lạm dụng: không mời nâng cấp (đã là Pro).
const ABUSE_MESSAGE = (n) => `Bạn đã dùng ${n} lượt hôm nay — mức tối đa mỗi ngày. Lượt sẽ được làm mới lúc 0:00.`;

/** Body 402 (§8): { error, code, limit }. */
export function limitBody(code, limit, { abuse = false } = {}) {
  const msg = abuse ? ABUSE_MESSAGE(limit) : (LIMIT_MESSAGES[code] || LIMIT_MESSAGES.limit_advanced_translate)(limit);
  return { error: msg, code, limit };
}

/** Body 426 (§8) — app cũ hiện nguyên câu lỗi của server. */
export const UPDATE_REQUIRED_BODY = Object.freeze({
  error: "Phiên bản Wordly này đã cũ, hãy cập nhật trên App Store để tiếp tục.",
  code: "update_required",
});
