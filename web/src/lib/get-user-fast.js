import { headers } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { userFromHeaders, shouldVerifyOverNetwork } from "@/lib/user-identity";

// Returns the authenticated user WITHOUT a network round-trip to Supabase Auth
// when possible. The middleware already validated the session and forwarded the
// user id + email via request headers (x-user-id / x-user-email). We read those
// here instead of calling supabase.auth.getUser() again (which is a network call).
//
// Falls back to supabase.auth.getUser() if the headers are absent (e.g. a route
// hit directly without passing through middleware, or during local edge cases),
// so behaviour is never less correct than before — only faster on the hot path.
//
// `publicRoute: true` bỏ luôn cú fallback đó. Dùng cho route CÔNG KHAI, nơi
// khách là đường đi bình thường: middleware không set header cho khách, nên
// mọi lượt khách đều phải trả 0.24-0.79s cho một cú gọi mạng chỉ để biết
// "đúng là không đăng nhập". Danh tính khách không dùng để làm gì (rate limit
// tính theo IP), nên đó là thời gian chờ vô ích của người dùng.
//
// Returns { id, email, provider } | null  (same shape the routes actually use)
export async function getUserFast({ publicRoute = false } = {}) {
  const h = await headers();
  const fromHeader = userFromHeaders(h);
  if (fromHeader) return fromHeader;

  if (!shouldVerifyOverNetwork({ hasHeaderUser: false, isPublicRoute: publicRoute })) {
    return null;
  }

  // Fallback: validate via Supabase (network). Keeps guests/edge cases correct.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email, provider: user.app_metadata?.provider || null } : null;
}
