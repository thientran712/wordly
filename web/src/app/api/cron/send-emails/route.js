import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { runDueEmailSends } from "@/lib/email/cron-send-emails";

// Cron VPS gọi endpoint này mỗi 5 phút (xem infra/vps/README.md) thay cho
// Inngest sleepUntil — xem src/lib/email/cron-send-emails.js.
export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runDueEmailSends(supabase);
  return Response.json(result);
}
