// Watchdog trên VPS (infra/vps/web/watchdog.sh, 15 phút/lần) gửi tình trạng server
// để trang thống kê + email sáng hiện được (spec 2026-10-16-admin-stats-design.md).
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { parseServerStatus } from "@/lib/admin/server-status";

export async function POST(request) {
  if (!validateCronSecret(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = parseServerStatus(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  const admin = createAdminClient();
  const now = new Date();
  const { error } = await admin.from("server_status").upsert({ id: 1, ...parsed.value, checked_at: now.toISOString() });
  // Lịch sử cho biểu đồ ổ đĩa / RAM 7 ngày trên dashboard; giữ 8 ngày. Lỗi không chặn.
  const { error: logErr } = await admin.from("server_status_log").insert({
    checked_at: now.toISOString(), disk_pct: parsed.value.disk_pct, mem_mb: parsed.value.mem_mb, problems_count: parsed.value.problems.length,
  });
  if (logErr) console.error("[admin/server-status] log", logErr.message);
  await admin.from("server_status_log").delete().lt("checked_at", new Date(now.getTime() - 8 * 86_400_000).toISOString());
  if (error) {
    console.error("[admin/server-status]", error.message);
    return Response.json({ error: "Không ghi được" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
