import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { validatePreferencesBody, DEFAULT_PUSH_TIME } from "@/lib/push/validate";

const FIELDS = "enabled, frequency, custom_days";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_preferences").select(FIELDS).eq("user_id", user.id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ preferences: data ?? null });
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-settings", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const v = validatePreferencesBody(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("push_preferences")
    .upsert({ user_id: user.id, ...v.value, updated_at: new Date().toISOString() })
    .select(FIELDS).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Bật lần đầu mà chưa có khung nào → tạo 20:00 (như email tạo 08:00)
  if (v.value.enabled) {
    const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!count) await supabase.from("push_slots").insert({ user_id: user.id, send_time: DEFAULT_PUSH_TIME });
  }
  return Response.json({ preferences: data });
}
