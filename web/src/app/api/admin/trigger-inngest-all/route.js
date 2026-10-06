import { createAdminClient } from "@/lib/supabase-admin";
import { inngest } from "@/inngest/client";
import { validateCronSecret } from "@/lib/validate-cron-secret";

export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: prefs, error } = await supabase
    .from("email_preferences")
    .select("user_id")
    .eq("enabled", true);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await inngest.send(
    prefs.map(p => ({
      name: "email/schedule.updated",
      data: { user_id: p.user_id },
    }))
  );

  return Response.json({ triggered: prefs.length, users: prefs.map(p => p.user_id) });
}
