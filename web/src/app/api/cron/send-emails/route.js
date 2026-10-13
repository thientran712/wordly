import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { runDueEmailSends } from "@/lib/email/cron-send-emails";
import { runDuePushSends } from "@/lib/push/cron-send-push";
import { runReminderCron } from "@/lib/reminders/run-reminder-cron";

// Cron VPS gọi endpoint này mỗi 5 phút (xem infra/vps/README.md) — chạy cả
// email (src/lib/email/cron-send-emails.js) và push (src/lib/push/cron-send-push.js).
// Giữ đường dẫn cũ để không phải sửa crontab trên VPS.
export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runReminderCron({
    email: () => runDueEmailSends(supabase),
    push: () => runDuePushSends(supabase),
  });
  return Response.json(result);
}
