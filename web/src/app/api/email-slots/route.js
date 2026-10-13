import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { guardSlotTime } from "@/lib/reminders/slot-guard";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: slots } = await supabase
    .from("email_slots")
    .select("*")
    .eq("user_id", user.id)
    .order("send_time", { ascending: true });

  return Response.json({ slots: slots || [] });
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  // Check slot count
  const { count } = await supabase
    .from("email_slots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count >= 10) return Response.json({ error: "Tối đa 10 slots" }, { status: 400 });

  const { send_time } = await request.json();
  if (!send_time) return Response.json({ error: "Missing send_time" }, { status: 400 });
  const guard = await guardSlotTime(supabase, { table: "email_slots", userId: user.id, value: send_time });
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabase
    .from("email_slots")
    .insert({ user_id: user.id, send_time: guard.time, enabled: true })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ slot: data });
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, send_time, enabled } = await request.json();
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const update = {};
  if (send_time !== undefined) {
    const guard = await guardSlotTime(supabase, { table: "email_slots", userId: user.id, value: send_time, excludeId: id });
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
    update.send_time = guard.time;
  }
  if (enabled !== undefined) update.enabled = enabled;

  const { error } = await supabase
    .from("email_slots")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Không cần báo lịch nữa — cron /api/cron/send-emails tự quét email_slots
  // mỗi 5 phút, thay đổi giờ/bật-tắt tự được nhận trong lần quét kế tiếp.
  return Response.json({ success: true });
}

export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();

  // Don't allow deleting the last slot
  const { count } = await supabase
    .from("email_slots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count <= 1) return Response.json({ error: "Phải có ít nhất 1 slot" }, { status: 400 });

  await supabase.from("email_slots").delete().eq("id", id).eq("user_id", user.id);

  return Response.json({ success: true });
}
