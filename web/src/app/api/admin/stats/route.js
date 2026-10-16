// Trang thống kê cho chủ dự án (spec 2026-10-16-admin-stats-design.md).
// ?t=<token> (link có hạn 7 ngày trong email sáng) → HTML; Bearer CRON_SECRET → JSON.
// Không có đăng nhập người dùng: middleware cho /api/admin đi qua, route tự kiểm.
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { verifyStatsToken } from "@/lib/admin/stats-token";
import { renderStatsPage } from "@/lib/admin/stats-render";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const bearer = validateCronSecret(request.headers.get("authorization"));
  const token = new URL(request.url).searchParams.get("t");
  if (!bearer && !verifyStatsToken(token, { secret: process.env.CRON_SECRET })) {
    return new Response("Link đã hết hạn hoặc không hợp lệ. Mở link trong email báo cáo mới nhất.", {
      status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const admin = createAdminClient();
  const [{ data, error }, today, extra] = await Promise.all([
    admin.rpc("admin_stats", {}), admin.rpc("admin_stats_today", {}), admin.rpc("admin_stats_extra", {}),
  ]);
  if (error) {
    console.error("[admin/stats]", error.message);
    return Response.json({ error: "Không tải được thống kê" }, { status: 500 });
  }
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
  if (bearer) return Response.json(data, { headers });
  const page = renderStatsPage({ ...data, today: today.error ? null : today.data, extra: extra.error ? null : extra.data });
  return new Response(page, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
