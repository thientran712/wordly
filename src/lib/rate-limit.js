// Rate limit — logic thuần, test được không cần DB.
// Xem tests/unit/rate-limit.test.mjs (14 ca).
//
// Vì sao cần: /api/translate và /api/dictionary CÔNG KHAI, không giới hạn →
// ai cũng đốt được quota DeepL/Groq. Đây là nợ kỹ thuật 🔴 trong PROGRESS.md.
//
// Dùng cửa sổ TRƯỢT (sliding window) thay vì reset theo mốc cố định: reset
// theo mốc cho phép gọi 2× giới hạn ngay quanh thời điểm reset.
//
// GIỚI HẠN ĐÃ BIẾT: bộ đếm nằm trong bộ nhớ tiến trình. Vercel chạy nhiều
// instance nên mỗi instance đếm riêng — giới hạn thực tế có thể cao hơn con
// số cấu hình. Vẫn chặn được lạm dụng thô (một script gọi liên tục), nhưng
// muốn chính xác tuyệt đối thì cần Redis/Upstash. Chấp nhận đánh đổi này vì
// mục tiêu là chặn đốt quota, không phải tính phí theo lượt.

const DEFAULT_MAX_KEYS = 10_000;

/**
 * Tạo một bộ giới hạn tần suất.
 *
 * @param limit     số lượt tối đa trong cửa sổ
 * @param windowMs  độ dài cửa sổ (ms)
 * @param maxKeys   số key tối đa giữ trong bộ nhớ (chống phình RAM)
 * @param clock     hàm trả về thời gian hiện tại — tiêm được để test
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
  clock = () => Date.now(),
} = {}) {
  // key -> mảng timestamp các lượt gọi trong cửa sổ
  const hits = new Map();

  /** Loại các timestamp đã ra khỏi cửa sổ. */
  const prune = (arr, now) => arr.filter((t) => now - t < windowMs);

  /** Dọn key không còn lượt nào — tránh Map phình vô hạn. */
  const sweep = (now) => {
    for (const [k, arr] of hits) {
      const kept = prune(arr, now);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }
  };

  return {
    /**
     * Ghi nhận một lượt gọi và cho biết có được phép không.
     * Trả về { allowed, remaining, retry_after_seconds, limit }
     */
    check(key) {
      const now = clock();
      const k = key || "unknown";

      // Dọn TRƯỚC khi thêm key mới, và chừa 1 chỗ cho key sắp thêm — nếu
      // dọn sau thì Map chạm maxKeys+1 trước khi bị cắt.
      if (!hits.has(k) && hits.size >= maxKeys) {
        sweep(now);
        if (hits.size >= maxKeys) {
          // Map là insertion-ordered nên key đầu là key được thêm sớm nhất
          const excess = hits.size - maxKeys + 1;
          let i = 0;
          for (const oldKey of hits.keys()) {
            if (i++ >= excess) break;
            hits.delete(oldKey);
          }
        }
      }

      const recent = prune(hits.get(k) || [], now);

      if (recent.length >= limit) {
        // Chờ tới khi lượt CŨ NHẤT ra khỏi cửa sổ
        const oldest = recent[0];
        const waitMs = windowMs - (now - oldest);
        hits.set(k, recent);
        return {
          allowed: false,
          remaining: 0,
          retry_after_seconds: Math.max(1, Math.ceil(waitMs / 1000)),
          limit,
        };
      }

      recent.push(now);
      hits.set(k, recent);

      return {
        allowed: true,
        remaining: limit - recent.length,
        retry_after_seconds: 0,
        limit,
      };
    },

    /** Số key đang giữ — dùng cho test và theo dõi bộ nhớ. */
    size() {
      sweep(clock());
      return hits.size;
    },
  };
}

/**
 * Xác định "ai đang gọi" để đếm riêng cho từng người.
 *
 * Người đã đăng nhập → đếm theo user id (chính xác hơn IP, và không bị
 * ảnh hưởng khi nhiều người dùng chung mạng công ty).
 * Khách → đếm theo IP.
 */
export function clientKeyFromRequest(request, userId = null) {
  if (userId) return `u:${userId}`;

  const h = request?.headers;
  const get = (name) => (typeof h?.get === "function" ? h.get(name) : null);

  // x-forwarded-for có thể là chuỗi proxy "client, proxy1, proxy2"
  // → IP thật của client là cái ĐẦU TIÊN
  const fwd = get("x-forwarded-for");
  if (fwd) {
    const first = String(fwd).split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const real = get("x-real-ip");
  if (real) return `ip:${String(real).trim()}`;

  return "ip:unknown";
}

/**
 * Tạo Response 429 kèm header chuẩn để client biết chờ bao lâu.
 */
export function rateLimitResponse(result, message) {
  return Response.json(
    {
      error: message || `Bạn gọi quá nhanh. Vui lòng thử lại sau ${result.retry_after_seconds} giây.`,
      rate_limited: true,
      retry_after_seconds: result.retry_after_seconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retry_after_seconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
