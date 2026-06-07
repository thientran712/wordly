import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { inngest } from "@/inngest/client";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: slots } = await admin
    .from("email_slots")
    .select("*")
    .eq("user_id", user.id)
    .order("send_time", { ascending: true });

  return Response.json({ slots: slots || [] });
}

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Check slot count
  const { count } = await admin
    .from("email_slots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count >= 10) return Response.json({ error: "Tối đa 10 slots" }, { status: 400 });

  const { send_time } = await request.json();
  if (!send_time) return Response.json({ error: "Missing send_time" }, { status: 400 });
  if (!/^\d{1,2}:\d{2}$/.test(send_time)) return Response.json({ error: "Invalid time format, use HH:MM" }, { status: 400 });
  const [hh, mm] = send_time.split(":").map(Number);
  if (hh > 23 || mm > 59) return Response.json({ error: "Invalid time value" }, { status: 400 });

  const { data, error } = await admin
    .from("email_slots")
    .insert({ user_id: user.id, send_time, enabled: true })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Schedule the new slot immediately
  await inngest.send({ name: "email/slot.scheduled", data: { user_id: user.id, slot_id: data.id } });

  return Response.json({ slot: data });
}

export async function PUT(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, send_time, enabled } = await request.json();
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();
  const update = {};
  if (send_time !== undefined) update.send_time = send_time;
  if (enabled !== undefined) update.enabled = enabled;

  const { error } = await admin
    .from("email_slots")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // If time changed or toggled on, cancel old run then wait before scheduling new one
  if (send_time !== undefined || enabled === true) {
    await inngest.send({ name: "email/slot.cancelled", data: { user_id: user.id, slot_id: id } });
    // 3s delay via a separate scheduled event so cancel propagates before new run starts
    await new Promise(r => setTimeout(r, 3000));
    await inngest.send({ name: "email/slot.scheduled", data: { user_id: user.id, slot_id: id } });
  } else if (enabled === false) {
    await inngest.send({ name: "email/slot.cancelled", data: { user_id: user.id, slot_id: id } });
  }

  return Response.json({ success: true });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const admin = createAdminClient();

  // Don't allow deleting the last slot
  const { count } = await admin
    .from("email_slots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count <= 1) return Response.json({ error: "Phải có ít nhất 1 slot" }, { status: 400 });

  await admin.from("email_slots").delete().eq("id", id).eq("user_id", user.id);

  // Cancel any sleeping Inngest run for this slot
  await inngest.send({ name: "email/slot.cancelled", data: { user_id: user.id, slot_id: id } });

  return Response.json({ success: true });
}
