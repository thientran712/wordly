// Email báo cáo 8:00 sáng giờ VN cho chủ dự án (spec 2026-10-16-admin-stats-design.md).
// Cron VPS gọi POST (Bearer CRON_SECRET). Gửi qua Resend tới ADMIN_REPORT_EMAIL.
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { signStatsToken } from "@/lib/admin/stats-token";
import { renderDailyReport } from "@/lib/admin/stats-render";

export async function POST(request) {
  if (!validateCronSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const to = process.env.ADMIN_REPORT_EMAIL;
  if (!to || !process.env.RESEND_API_KEY) return Response.json({ skipped: "chưa cấu hình ADMIN_REPORT_EMAIL / RESEND_API_KEY" });

  const { data, error } = await createAdminClient().rpc("admin_stats", {});
  if (error) {
    console.error("[cron/daily-report]", error.message);
    return Response.json({ error: "Không tải được thống kê" }, { status: 500 });
  }
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.wordly.skillproof.work";
  const link = `${base}/api/admin/stats?t=${signStatsToken({ secret: process.env.CRON_SECRET })}`;
  const { subject, text, html } = renderDailyReport(data, { link });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Wordly Báo cáo <noreply@wordly.skillproof.work>", to: [to], subject, text, html }),
  });
  if (!res.ok) {
    console.error("[cron/daily-report] Resend", res.status, (await res.text()).slice(0, 200));
    return Response.json({ error: "Gửi email lỗi" }, { status: 502 });
  }
  return Response.json({ sent: true });
}
