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
  const { error } = await createAdminClient().from("server_status")
    .upsert({ id: 1, ...parsed.value, checked_at: new Date().toISOString() });
  if (error) {
    console.error("[admin/server-status]", error.message);
    return Response.json({ error: "Không ghi được" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
