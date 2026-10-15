// Chặn theo gói ở các route có giới hạn (spec 2026-10-16 §1, §3, §8).
//
// Mọi truy cập DB đi qua `deps` (tiêm vào) để test được mọi nhánh không cần
// Supabase — bản thật: createBillingDeps() trong ./store.js.
//
// Nguyên tắc (chủ dự án chốt):
//  - BILLING_ENFORCE tắt → chạy Y NHƯ HÔM NAY, không đọc gì thêm từ DB.
//  - Chỉ trừ lượt khi tính năng THÀNH CÔNG (2xx); AI lỗi/timeout không trừ.
//  - Pro → không gọi hàm hạn mức (usage_today/consume_quota) nào.
//  - DB billing lỗi → CHO QUA và ghi log: không chặn người dùng thật (nhất là
//    người đã trả tiền) vì sự cố của mình; chi phí vẫn có rate limit chặn thô.
import {
  FREE_LIMITS, PRO_LIMITS, PRO_ABUSE_CAPS, isPro, requiresUpdate, billingEnforced, appMinBuild,
  limitBody, UPDATE_REQUIRED_BODY,
} from "./plan.js";

export function billingConfig(env = process.env, userId) {
  return { enforced: billingEnforced(env, userId), minBuild: appMinBuild(env) };
}

const updateRequired = () => Response.json(UPDATE_REQUIRED_BODY, { status: 426 });
const limitReached = (code, limit, opts) => Response.json(limitBody(code, limit, opts), { status: 402 });
// Thành công VÀ app chưa huỷ request: app huỷ (người dùng bấm huỷ / thoát màn)
// thì không nhận được kết quả → không trừ lượt (spec §3).
const isSuccess = (res, signal) => res && res.status >= 200 && res.status < 300 && !signal?.aborted;

function logFail(where, e) {
  console.error(`[billing] ${where} lỗi, cho qua:`, e?.message || e);
}

/** Pro không? Lỗi đọc → null (không biết) để chỗ gọi cho qua. */
async function proOrNull(deps, now) {
  try {
    return isPro(await deps.getEntitlement(), now);
  } catch (e) {
    logFail("getEntitlement", e);
    return null;
  }
}

/**
 * Dịch nâng cao: câu (> 3 chữ, Gemini), ảnh, giọng nói. `kind` ∈ sentence|image|voice.
 * Miễn phí: 5 lượt/ngày tính chung — kiểm TRƯỚC (hết lượt thì không đốt tiền
 * AI), trừ SAU khi thành công. Pro: chỉ trần chống lạm dụng theo từng loại.
 */
// quota_key: UUID app tạo cho mỗi lần soạn (dịch trực tiếp khi gõ/nói gửi
// nhiều request cho một câu). Câu/giọng nói: tối đa 1 lượt mỗi key mỗi ngày
// (40 lượt gọi/key, xem consume_quota). Ảnh luôn tính theo request.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function normalizeQuotaKey(kind, quotaKey) {
  if (kind === "image" || typeof quotaKey !== "string") return undefined;
  const k = quotaKey.trim().toLowerCase();
  return UUID_RE.test(k) ? k : undefined;
}

export async function withAdvancedQuota({ config, user, build, kind, quotaKey: rawKey, deps, now = new Date(), signal }, run) {
  if (!config.enforced) return run();
  if (!user) return Response.json({ error: "Đăng nhập để dùng dịch câu, ảnh, giọng nói." }, { status: 401 });
  if (requiresUpdate(build, config.minBuild, true)) return updateRequired();

  const quotaKey = normalizeQuotaKey(kind, rawKey);
  const pro = await proOrNull(deps, now);
  if (pro === null) return run();

  if (pro) {
    const cap = PRO_ABUSE_CAPS[kind];
    try {
      const r = await deps.bumpProCap(kind, cap, quotaKey);
      if (!r.allowed) return limitReached("limit_advanced_translate", cap, { abuse: true });
    } catch (e) {
      logFail("bumpProCap", e);
    }
    return run();
  }

  const limit = FREE_LIMITS.advanced_translate;
  try {
    const usage = await deps.usageToday(undefined, quotaKey);
    // Câu đang soạn đã trừ lượt hôm nay → không chặn giữa câu dù đã hết lượt
    if ((usage?.advanced_translate || 0) >= limit && !usage?.key_active) {
      return limitReached("limit_advanced_translate", limit);
    }
  } catch (e) {
    logFail("usageToday", e);
    return run();
  }

  const res = await run();
  if (isSuccess(res, signal)) {
    try {
      await deps.consume("advanced_translate", limit, undefined, quotaKey);
    } catch (e) {
      logFail("consume", e);
    }
  }
  return res;
}

/**
 * Thẻ từ điển chi tiết. Từ đã biết (đã tra/đã lưu/kho từ/đã gợi ý) → miễn
 * phí, kể cả app cũ (widget app cũ vẫn chạy). Từ mới: miễn phí 5/ngày.
 * `run({ cacheOnly })`: cacheOnly → route chỉ trả từ cache, không gọi AI
 * (tra ngầm cho widget `purpose=widget`, khách) — spec §3.
 */
export async function withDictionaryQuota({ config, user, build, wordKey, purpose, deps, now = new Date(), signal }, run) {
  if (!config.enforced) return run({ cacheOnly: false });
  if (!user) return run({ cacheOnly: true });

  const pro = await proOrNull(deps, now);
  if (pro !== false) return run({ cacheOnly: false });

  const limit = FREE_LIMITS.dictionary;
  let usage;
  try {
    usage = await deps.usageToday(wordKey);
  } catch (e) {
    logFail("usageToday", e);
    return run({ cacheOnly: false });
  }
  if (usage?.known_word) return run({ cacheOnly: false });
  if (purpose === "widget") return run({ cacheOnly: true });
  if (requiresUpdate(build, config.minBuild, true)) return updateRequired();
  if ((usage?.dictionary || 0) >= limit) return limitReached("limit_dictionary", limit);

  const res = await run({ cacheOnly: false });
  if (isSuccess(res, signal)) {
    try {
      const body = await res.clone().json();
      // Không phải từ thật (detail null) → không mất lượt
      if (body?.detail) await deps.consume("dictionary", limit, wordKey);
    } catch (e) {
      logFail("consume", e);
    }
  }
  return res;
}

/**
 * Lưu thêm một từ (POST is_saved, PATCH "Lưu", khôi phục từ đã lưu).
 * Trả Response chặn, hoặc null nếu được lưu. Người đã có > 30 từ giữ nguyên
 * hết, chỉ không lưu thêm (spec §3).
 */
export async function checkSaveAllowed({ config, user, build, deps, now = new Date() }) {
  if (!config.enforced || !user) return null;
  if (requiresUpdate(build, config.minBuild, true)) return updateRequired();
  const pro = await proOrNull(deps, now);
  if (pro !== false) return null;
  const limit = FREE_LIMITS.saved_words;
  try {
    if ((await deps.countSaved()) >= limit) return limitReached("limit_saved_words", limit);
  } catch (e) {
    logFail("countSaved", e);
  }
  return null;
}

/** Thêm / bật thêm một khung giờ nhắc ôn. Trả Response chặn hoặc null. */
export async function checkPushSlotAllowed({ config, user, build, deps, now = new Date() }) {
  if (!config.enforced || !user) return null;
  if (requiresUpdate(build, config.minBuild, true)) return updateRequired();
  const pro = await proOrNull(deps, now);
  if (pro === null) return null;
  const limit = pro ? PRO_LIMITS.push_slots : FREE_LIMITS.push_slots;
  try {
    if ((await deps.countEnabledSlots()) >= limit) return limitReached("limit_push_slots", limit);
  } catch (e) {
    logFail("countEnabledSlots", e);
  }
  return null;
}
