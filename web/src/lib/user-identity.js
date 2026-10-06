// Nhận diện người dùng từ header — logic thuần, KHÔNG import gì.
//
// Vì sao tách khỏi get-user-fast.js: file kia import `next/headers` nên
// `node --test` không nạp được. Theo ghi chú CLAUDE.md — tách logic thuần ra
// src/lib/ để test được.

/**
 * Đọc danh tính từ header do middleware chuyển xuống. Không gọi mạng.
 * Trả về { id, email, provider } | null
 */
export function userFromHeaders(h) {
  const id = h.get("x-user-id");
  if (!id) return null;
  return {
    id,
    email: h.get("x-user-email") || null,
    provider: h.get("x-user-provider") || null,
  };
}

/**
 * Có cần xác thực qua mạng (supabase.auth.getUser) hay không?
 *
 * Vì sao cần quyết định này: middleware chỉ set x-user-id khi ĐÃ đăng nhập,
 * nên khách luôn thiếu header và luôn rơi vào cú gọi mạng 0.24-0.79s. Với
 * route công khai thì danh tính khách không dùng để làm gì — rate limit đã
 * tính theo IP — nên cú gọi đó là phí thời gian của người dùng.
 *
 * Nhưng KHÔNG được bỏ với route cần đăng nhập: route protected bị gọi trực
 * tiếp (không qua middleware) vẫn phải xác thực thật. Nên mặc định là gọi
 * mạng, chỉ bỏ khi biết chắc là route công khai.
 */
export function shouldVerifyOverNetwork({ hasHeaderUser, isPublicRoute } = {}) {
  if (hasHeaderUser) return false;   // đã có danh tính, không cần hỏi lại
  return !isPublicRoute;              // công khai → bỏ qua; còn lại → xác thực
}
