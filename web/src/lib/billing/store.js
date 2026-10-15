// Truy cập DB cho billing — bản thật của `deps` mà enforce.js cần.
//
// `supabase` là client NGƯỜI DÙNG (anon + JWT, chịu RLS): entitlements /
// usage_daily chỉ đọc được dòng của chính người đó, consume_quota lấy
// auth.uid() nên không trừ lượt hộ người khác được.
// `sharedSupabase` (createSharedClient) chỉ dùng cho bộ đếm rate limit chung.
import { checkRateLimitDb, buildBucketKey, windowStartFor } from "../security/rate-limit-db.js";

const DAY_MS = 86_400_000;
const KEY_CALLS = 40; // = giới hạn lượt gọi mỗi quota_key trong consume_quota
// Bộ đếm rate limit chia khung theo mốc UTC; dịch +7h để khung trùng ngày giờ
// VN (lượt về 0 lúc 0:00 Asia/Ho_Chi_Minh, spec §3 — VN không có giờ mùa hè).
export const vnDayShiftMs = 7 * 3_600_000;

function must({ data, error, count }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return count !== undefined && data == null ? count : data;
}

export function createBillingDeps({ supabase, sharedSupabase, userId, now = () => Date.now() }) {
  let entitlement; // nhớ trong một request: một route có thể hỏi nhiều lần
  return {
    async getEntitlement() {
      if (entitlement === undefined) {
        const r = await supabase.from("entitlements")
          .select("source, product_id, expires_at, in_grace, grace_expires_at, auto_renew, environment")
          .eq("user_id", userId).maybeSingle();
        entitlement = must(r, "entitlements") ?? null;
      }
      return entitlement;
    },
    async usageToday(wordKey, quotaKey) {
      const args = {};
      if (wordKey) args.p_word_key = wordKey;
      if (quotaKey) args.p_quota_key = quotaKey;
      return must(await supabase.rpc("usage_today", args), "usage_today");
    },
    async consume(kind, limit, wordKey, quotaKey) {
      const args = { p_kind: kind, p_limit: limit, p_word_key: wordKey ?? null };
      if (quotaKey) args.p_quota_key = quotaKey;
      return must(await supabase.rpc("consume_quota", args), "consume_quota");
    },
    // Trần chống lạm dụng của Pro: dùng bộ đếm rate limit chung (KHÔNG phải
    // hàm hạn mức — chủ dự án chốt Pro không gọi consume_quota). Đếm lượt gọi,
    // không chỉ lượt thành công: đây là chặn lạm dụng, không phải tính lượt.
    // Có quota_key (câu đang soạn): chỉ tính vào trần khi key mới hoặc đã qua
    // 40 lượt gọi — cùng luật gộp với consume_quota, để gõ trực tiếp không đốt trần.
    async bumpProCap(kind, cap, quotaKey) {
      if (quotaKey) {
        const t = now() + vnDayShiftMs;
        const { data, error } = await sharedSupabase.rpc("bump_rate_limit", {
          p_bucket_key: buildBucketKey("pro-key", `${userId}:${quotaKey}`),
          p_window_start: new Date(windowStartFor(t, DAY_MS)).toISOString(),
          p_window_ms: DAY_MS,
        });
        const calls = Number(data);
        if (!error && Number.isFinite(calls) && (calls - 1) % KEY_CALLS !== 0) return { allowed: true };
      }
      return checkRateLimitDb({
        supabase: sharedSupabase, scope: `pro-${kind}`, clientKey: userId,
        limit: cap, windowMs: DAY_MS, now: now() + vnDayShiftMs,
      });
    },
    async countSaved() {
      const r = await supabase.from("translate_history").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("is_saved", true).is("deleted_at", null);
      return must(r, "countSaved") ?? 0;
    },
    async countEnabledSlots() {
      const r = await supabase.from("push_slots").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("enabled", true);
      return must(r, "countEnabledSlots") ?? 0;
    },
  };
}
