// Trang thống kê cố định cho chủ dự án: https://…/admin (chủ dự án chọn mật khẩu
// riêng 16/10/2026 — spec 2026-10-16-admin-stats-design.md §6). Web người học đang
// tắt nên không có phiên đăng nhập web: HTTP Basic với ADMIN_DASHBOARD_PASSWORD.
// Số liệu tính lại mỗi lần mở, trang tự tải lại mỗi 30 giây.
import { createAdminClient } from "@/lib/supabase/admin";
import { createSharedClient } from "@/lib/supabase/shared";
import { clientKeyFromRequest } from "@/lib/security/rate-limit";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { checkBasicAuth } from "@/lib/admin/basic-auth";
import { renderStatsPage } from "@/lib/admin/stats-render";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(request) {
  // Mọi lượt (đúng hay sai) đều đếm: tự tải lại 30 giây ≈ 30 lượt/15 phút, chặn
  // dò mật khẩu ở 120 lượt/15 phút cho mỗi IP (mật khẩu tối thiểu 12 ký tự).
  const rl = await checkRateLimitDb({
    supabase: createSharedClient(), scope: "admin-dashboard",
    clientKey: clientKeyFromRequest(request), limit: 120, windowMs: 15 * 60_000,
  });
  if (!rl.allowed) {
    return new Response(`Thử quá nhiều lần. Đợi ${rl.retry_after_seconds} giây.`, {
      status: 429, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(rl.retry_after_seconds) },
    });
  }
  if (!checkBasicAuth(request.headers.get("authorization"), process.env.ADMIN_DASHBOARD_PASSWORD)) {
    return new Response("Cần mật khẩu.", {
      status: 401,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", "WWW-Authenticate": 'Basic realm="Wordly Admin", charset="UTF-8"' },
    });
  }
  const admin = createAdminClient();
  const [stats, today] = await Promise.all([admin.rpc("admin_stats", {}), admin.rpc("admin_stats_today", {})]);
  if (stats.error) {
    console.error("[admin]", stats.error.message);
    return Response.json({ error: "Không tải được thống kê" }, { status: 500, headers: HEADERS });
  }
  const page = renderStatsPage({ ...stats.data, today: today.error ? null : today.data }, { refreshSeconds: 30 });
  return new Response(page, { headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
