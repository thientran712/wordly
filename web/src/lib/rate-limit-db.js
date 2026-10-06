// Rate limit dùng Postgres làm bộ đếm CHUNG.
//
// ═══ VÌ SAO CÓ FILE NÀY ═══
// rate-limit.js đếm trong bộ nhớ tiến trình và KHÔNG hoạt động trên Vercel.
// Đã kiểm chứng trên production ngày 4/9/2026: gọi /api/dictionary 18 lần,
// 0 lần bị chặn dù giới hạn là 15/phút. Nguyên nhân: 6 lần gọi liên tiếp
// được 6 instance khác nhau phục vụ (x-vercel-id: cr6hw, l56tv, vwn2r,
// xqkhf, 7zxcm, 6stbm) — mỗi instance có bộ đếm riêng nên không ai chạm
// ngưỡng. Thực tế là GẦN NHƯ KHÔNG CÓ GIỚI HẠN.
//
// Bản này đếm trong database nên mọi instance dùng chung một bộ đếm.
//
// ═══ ĐÁNH ĐỔI ĐÃ CHỌN ═══
// • Thêm ~20-40ms mỗi request (một lượt ghi DB). Chấp nhận được vì các route
//   này vốn đã gọi AI mất 1-3 giây.
// • Dùng KHUNG CỐ ĐỊNH (fixed window) thay vì cửa sổ trượt: đơn giản, chỉ
//   cần 1 lượt ghi. Nhược điểm: quanh mốc đổi khung có thể cho qua tới 2×
//   giới hạn trong thời gian ngắn. Với mục tiêu chặn đốt quota thì chấp
//   nhận được — sliding window cần lưu từng timestamp, đắt hơn nhiều.
// • FAIL-OPEN khi DB lỗi: thà cho người dùng thật dùng được còn hơn chặn
//   hết. Rate limit ở đây bảo vệ CHI PHÍ, không phải bảo vệ an ninh.

/**
 * Mốc bắt đầu của khung thời gian chứa thời điểm `now`.
 *
 * ĐIỂM CỐT TỬ: mốc phải chia hết cho windowMs để MỌI instance tính ra cùng
 * một giá trị. Nếu mỗi instance tính mốc khác nhau thì chúng lại đếm riêng
 * và lỗi cũ lặp lại.
 */
export function windowStartFor(now, windowMs) {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Tạo khoá đếm: tách theo từng route VÀ từng người gọi.
 *
 * Làm sạch ký tự để an toàn khi ghi DB và cắt độ dài cho khớp cột.
 */
export function buildBucketKey(scope, clientKey) {
  const safe = String(clientKey || "unknown").replace(/[^A-Za-z0-9:._-]/g, "_");
  const safeScope = String(scope || "default").replace(/[^A-Za-z0-9._-]/g, "_");
  // Cột VARCHAR(200); chừa chỗ cho scope + dấu ':'
  return `${safeScope}:${safe}`.slice(0, 200);
}

/**
 * Quyết định cho qua hay chặn, dựa trên số đếm DB trả về.
 *
 * @param count       số lượt trong khung SAU KHI đã tăng (null nếu DB lỗi)
 * @param limit       số lượt tối đa
 * @param windowMs    độ dài khung
 * @param windowStart mốc bắt đầu khung
 * @param now         thời điểm hiện tại
 */
export function decideFromCount({ count, limit, windowMs, windowStart, now }) {
  // DB lỗi → fail-open, nhưng đánh dấu degraded để chỗ gọi ghi log
  if (count === null || count === undefined) {
    return { allowed: true, remaining: limit, retry_after_seconds: 0, limit, degraded: true };
  }

  // Thời gian còn lại của khung. Math.max chống đồng hồ lệch (now có thể
  // nhỏ hơn windowStart trên hệ phân tán) và chống retry_after = 0 làm
  // client thử lại ngay rồi bị chặn tiếp, thành vòng lặp vô ích.
  const elapsed = Math.max(0, Math.min(windowMs, now - windowStart));
  const retryAfter = Math.max(1, Math.ceil((windowMs - elapsed) / 1000));

  if (count > limit) {
    return { allowed: false, remaining: 0, retry_after_seconds: retryAfter, limit, degraded: false };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - count),
    retry_after_seconds: 0,
    limit,
    degraded: false,
  };
}

/**
 * Kiểm tra hạn mức bằng bộ đếm dùng chung trong Postgres.
 *
 * Dùng hàm SQL `bump_rate_limit` (atomic INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING) nên hai request đồng thời không thể cùng đọc ra số cũ.
 *
 * @returns { allowed, remaining, retry_after_seconds, limit, degraded }
 */
export async function checkRateLimitDb({
  supabase,
  scope,
  clientKey,
  limit,
  windowMs,
  now = Date.now(),
}) {
  const windowStart = windowStartFor(now, windowMs);
  const bucketKey = buildBucketKey(scope, clientKey);

  let count = null;
  try {
    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_bucket_key: bucketKey,
      p_window_start: new Date(windowStart).toISOString(),
      p_window_ms: windowMs,
    });
    if (error) throw new Error(error.message);
    count = typeof data === "number" ? data : Number(data);
    if (!Number.isFinite(count)) count = null;
  } catch (e) {
    // Fail-open: DB lỗi không được làm sập tính năng của người dùng thật
    console.error(`[rate-limit-db] ${bucketKey} lỗi, cho qua:`, e.message);
    count = null;
  }

  return decideFromCount({ count, limit, windowMs, windowStart, now });
}
