// Cache JWKS trong Postgres — dùng chung mọi serverless instance.
// Xem tests/unit/jwks-cache.test.mjs.
//
// VÌ SAO POSTGRES (không phải RAM): cache trong RAM của GoTrueClient chỉ
// sống trong 1 serverless instance. Vercel tạo instance mới liên tục (cold
// start), nên cache RAM gần như luôn miss — đã đo thực tế: mỗi request gọi
// mạng tới JWKS endpoint (~150-330ms). Postgres là nơi MỌI instance cùng
// đọc được, giống pattern rate_limit_counters đã dùng cho rate limit.
//
// JWKS gần như KHÔNG BAO GIỜ đổi (chỉ đổi khi Supabase xoay khoá ký, rất
// hiếm), nên TTL dài (1 giờ) là an toàn — không phải đánh đổi độ tươi lấy
// tốc độ như rate limit.

export const JWKS_TTL_MS = 60 * 60 * 1000; // 1 giờ

/** Cache đã cũ chưa, dựa trên thời điểm lưu lần cuối. */
export function isJwksStale(cachedAtMs, now = Date.now()) {
  if (!cachedAtMs) return true;
  return now - cachedAtMs > JWKS_TTL_MS;
}

let memoCache = null; // vẫn giữ cache RAM làm lớp NHANH NHẤT trong cùng 1
// instance (khi nó may mắn còn sống) — Postgres là lớp sau, không phải lớp
// duy nhất. Không tốn gì để giữ cả hai.

/**
 * Lấy JWKS, ưu tiên cache RAM (nếu instance đang ấm) → cache Postgres →
 * gọi mạng tới Supabase (chỉ khi cả hai cache đều miss/cũ).
 *
 * `admin` được TRUYỀN VÀO (dependency injection) thay vì tự tạo client ở
 * đây — để file này không tự import @/lib/supabase-admin, giữ phần logic
 * (isJwksStale) test được bằng node --test thuần, không cần alias Next.js.
 */
export async function getCachedJwks(admin, supabaseAuthUrl) {
  const now = Date.now();

  if (memoCache && !isJwksStale(memoCache.cachedAt, now)) {
    return memoCache.jwks;
  }

  const { data: row } = await admin
    .from("jwks_cache")
    .select("jwks, cached_at")
    .eq("id", "default")
    .maybeSingle();

  if (row && !isJwksStale(new Date(row.cached_at).getTime(), now)) {
    memoCache = { jwks: row.jwks, cachedAt: new Date(row.cached_at).getTime() };
    return row.jwks;
  }

  // Cache Postgres cũng cũ/miss → gọi mạng, đây là lượt DUY NHẤT trả giá
  // network trong mỗi giờ (thay vì mỗi request).
  let jwks;
  try {
    const res = await fetch(`${supabaseAuthUrl}/.well-known/jwks.json`);
    if (!res.ok) throw new Error(`JWKS endpoint trả ${res.status}`);
    jwks = await res.json();
  } catch (e) {
    // Gọi mạng lỗi: dùng cache CŨ nếu có còn hơn không có gì — JWKS đổi rất
    // hiếm nên dữ liệu cũ vẫn hầu như chắc chắn đúng.
    if (row?.jwks) {
      console.error("[jwks-cache] refresh lỗi, dùng cache cũ:", e.message);
      return row.jwks;
    }
    throw e;
  }

  memoCache = { jwks, cachedAt: now };
  // Ghi lại Postgres — không chặn request nếu ghi lỗi (đã có JWKS để dùng).
  await admin
    .from("jwks_cache")
    .upsert({ id: "default", jwks, cached_at: new Date(now).toISOString() })
    .then(({ error }) => {
      if (error) console.error("[jwks-cache] không ghi được cache:", error.message);
    });

  return jwks;
}
