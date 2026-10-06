import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { inngest } from "@/inngest/client";
import { getUserFast } from "@/lib/get-user-fast";

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

  // Read current prefs to detect actual changes
  const { data: existing } = await supabase
    .from("email_preferences")
    .select("enabled, frequency, custom_days")
    .eq("user_id", user.id)
    .single();

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

  const wasEnabled = existing?.enabled ?? false;
  const frequencyChanged = existing?.frequency !== newFrequency;
  const customDaysChanged = JSON.stringify(existing?.custom_days ?? []) !== JSON.stringify(newCustomDays);
  const toggledOff = wasEnabled && !newEnabled;
  const toggledOn = !wasEnabled && newEnabled;
  const scheduleChanged = frequencyChanged || customDaysChanged;

  if (toggledOff) {
    // User turned off email — cancel all slot runs immediately
    const admin = createAdminClient();
    const { data: slots } = await admin
      .from("email_slots")
      .select("id")
      .eq("user_id", user.id);

    if (slots?.length) {
      await inngest.send(slots.map(slot => ({
        name: "email/slot.cancelled",
        data: { user_id: user.id, slot_id: slot.id, triggeredAt: Date.now() },
      })));
    }
  } else if (toggledOn || scheduleChanged) {
    // Email turned on, or frequency/days changed — reschedule all slots
    await inngest.send({ name: "email/schedule.updated", data: { user_id: user.id } });
  }
  // If nothing changed: no Inngest event fired

  return Response.json({ preferences: data[0] });
}
