// Như /api/email-slots, nhưng giờ chỉ mốc :00/:30 (DB cũng chặn bằng CHECK + UNIQUE).
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { guardSlotTime } from "@/lib/reminders/slot-guard";
import { MAX_PUSH_SLOTS } from "@/lib/push/validate";

async function authed() {
  const user = await getUserFast();
  if (!user) return { res: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-settings", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return { res: rateLimitResponse(rl) };
  return { user, supabase: await createClient() };
}

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_slots").select("id, send_time, enabled")
    .eq("user_id", user.id).order("send_time", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slots: data || [] });
}

export async function POST(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count >= MAX_PUSH_SLOTS) return Response.json({ error: `Tối đa ${MAX_PUSH_SLOTS} khung giờ` }, { status: 400 });

  const { send_time } = (await request.json().catch(() => null)) || {};
  const guard = await guardSlotTime(supabase, { table: "push_slots", userId: user.id, value: send_time });
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabase.from("push_slots")
    .insert({ user_id: user.id, send_time: guard.time, enabled: true }).select("id, send_time, enabled").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slot: data });
}

export async function PUT(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const { id, send_time, enabled } = (await request.json().catch(() => null)) || {};
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const update = {};
  if (send_time !== undefined) {
    const guard = await guardSlotTime(supabase, { table: "push_slots", userId: user.id, value: send_time, excludeId: id });
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
    update.send_time = guard.time;
  }
  if (enabled !== undefined) update.enabled = Boolean(enabled);

  const { error } = await supabase.from("push_slots").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count <= 1) return Response.json({ error: "Phải có ít nhất 1 khung giờ" }, { status: 400 });
  await supabase.from("push_slots").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ success: true });
}
