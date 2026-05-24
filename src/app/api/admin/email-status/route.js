import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: prefs } = await supabase
    .from("email_preferences")
    .select("user_id, enabled, send_time, frequency, custom_days, last_sent_at, last_sent_word_id")
    .order("send_time");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, name, timezone");

  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const { data: words } = await supabase.from("words").select("id, word");

  const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
  const authMap = Object.fromEntries((authData?.users || []).map(u => [u.id, u]));
  const wordMap = Object.fromEntries((words || []).map(w => [w.id, w.word]));

  const rows = (prefs || []).map(pref => {
    const profile = profileMap[pref.user_id] || {};
    const authUser = authMap[pref.user_id] || {};
    const timezone = profile.timezone || "Asia/Ho_Chi_Minh";
    const email = profile.email || authUser.email || "unknown";

    // Thời gian hiện tại của user
    const userNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const userNowStr = userNow.toLocaleString("vi-VN", { timeZone: timezone, hour12: false });

    // last_sent_at theo timezone user
    let lastSentStr = null;
    let lastSentToday = false;
    if (pref.last_sent_at) {
      const lastSent = new Date(pref.last_sent_at);
      lastSentStr = lastSent.toLocaleString("vi-VN", { timeZone: timezone, hour12: false });
      lastSentToday =
        new Date(lastSent.toLocaleString("en-US", { timeZone: timezone })).toDateString() ===
        userNow.toDateString();
    }

    // Tính scheduled time hôm nay
    const [sendHour, sendMinute] = pref.send_time.split(":").map(Number);
    const scheduledToday = new Date(userNow);
    scheduledToday.setHours(sendHour, sendMinute, 0, 0);
    const scheduledTodayStr = scheduledToday.toLocaleString("vi-VN", { timeZone: timezone, hour12: false });

    // Delay nếu đã gửi hôm nay
    let delayMinutes = null;
    if (lastSentToday && pref.last_sent_at) {
      const lastSentLocal = new Date(new Date(pref.last_sent_at).toLocaleString("en-US", { timeZone: timezone }));
      delayMinutes = Math.round((lastSentLocal.getTime() - scheduledToday.getTime()) / 60000);
    }

    return {
      email,
      name: profile.name || authUser.email?.split("@")[0],
      enabled: pref.enabled,
      send_time: pref.send_time,
      frequency: pref.frequency,
      timezone,
      user_now: userNowStr,
      scheduled_today: scheduledTodayStr,
      last_sent_at: lastSentStr,
      last_sent_word: pref.last_sent_word_id ? wordMap[pref.last_sent_word_id] : null,
      sent_today: lastSentToday,
      delay_minutes: delayMinutes,
      status: !pref.enabled
        ? "❌ disabled"
        : lastSentToday
        ? `✅ sent${delayMinutes !== null ? ` (+${delayMinutes}m delay)` : ""}`
        : userNow > scheduledToday
        ? "⚠️ missed (should have sent)"
        : "⏳ pending",
    };
  });

  return Response.json({
    checked_at: now.toISOString(),
    users: rows,
  });
}
