import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { runDuePushSends } from "@/lib/push/cron-send-push";
import { runReminderCron } from "@/lib/reminders/run-reminder-cron";

// Cron VPS gọi endpoint này mỗi 5 phút (xem infra/vps/README.md) — chạy thông
// báo đẩy nhắc ôn (src/lib/push/cron-send-push.js). Email nhắc học đã bỏ
// (chủ dự án 13/10/2026); giữ đường dẫn cũ để khỏi sửa crontab trên VPS.
export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runReminderCron({
    push: () => runDuePushSends(supabase),
  });
  return Response.json(result);
}
