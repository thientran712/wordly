import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/auth/get-user-fast";

export async function GET() {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ preferences: data });
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const body = await request.json();
  const newEnabled = body.enabled ?? true;
  const newFrequency = body.frequency;
  const newCustomDays = body.custom_days || [];

  const { data, error } = await supabase
    .from("email_preferences")
    .upsert({
      user_id: user.id,
      enabled: newEnabled,
      send_time: body.send_time,
      frequency: newFrequency,
      custom_days: newCustomDays,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Không cần báo lịch nữa — cron /api/cron/send-emails tự quét
  // email_preferences mỗi 5 phút, thay đổi tự được nhận trong lần quét kế tiếp.
  return Response.json({ preferences: data[0] });
}
