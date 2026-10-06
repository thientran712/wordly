// Nhận diện nguồn danh tính cho request từ app iOS — logic thuần, KHÔNG import gì.
//
// App iOS không có cookie, nó gửi `Authorization: Bearer <access_token>`.
// Module này CHỈ quyết định có dùng token đó hay không; chữ ký JWT vẫn do
// supabase.auth.getClaims() kiểm ở middleware (và PostgREST kiểm lại khi
// truy vấn qua RLS). Không verify gì ở đây.

const MAX_TOKEN_LENGTH = 8192;
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
// sb-<ref>-auth-token, hoặc bản chia mảnh sb-<ref>-auth-token.0, .1 ...
const AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$/;

/** Lấy token từ header Authorization. Trả về string | null. */
export function extractBearerToken(headerValue) {
  if (!headerValue) return null;
  const match = /^Bearer (\S+)$/i.exec(headerValue);
  if (!match) return null;
  const token = match[1];
  if (token.length > MAX_TOKEN_LENGTH || !JWT_SHAPE.test(token)) return null;
  return token;
}

/** Request có cookie session của Supabase không. */
export function hasCookieSession(cookieNames) {
  return cookieNames.some((name) => AUTH_COOKIE.test(name));
}

/**
 * Token Bearer cần dùng, hoặc null nếu phải dùng cookie (hoặc khách).
 * Cookie LUÔN thắng: trình duyệt đã đăng nhập không đổi danh tính chỉ vì
 * có thêm header Authorization.
 */
export function bearerToForward({ cookieNames, authorizationHeader }) {
  if (hasCookieSession(cookieNames)) return null;
  return extractBearerToken(authorizationHeader);
}
