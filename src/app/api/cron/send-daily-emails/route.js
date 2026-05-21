import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

export const maxDuration = 60;

async function processUser(supabase, pref, userInfo, now) {
  try {
    if (!userInfo?.email) {
      return { skipped: { user_id: pref.user_id, reason: "no email" } };
    }

    // Timezone-aware current time
    const userNow = new Date(now.toLocaleString("en-US", { timeZone: userInfo.timezone }));
    const currentHour = userNow.getHours();
    const currentMinute = userNow.getMinutes();
    const currentDay = userNow.getDay();

    // Already sent today? (in user's timezone)
    if (pref.last_sent_at) {
      const lastSentUserTime = new Date(new Date(pref.last_sent_at).toLocaleString("en-US", { timeZone: userInfo.timezone }));
      const lastSentDay = lastSentUserTime.toDateString();
      const todayDay = userNow.toDateString();
      if (lastSentDay === todayDay) {
        return { skipped: { email: userInfo.email, reason: "already sent today" } };
      }
    }

    // Time window check (±90 min — handles GitHub Actions delay up to ~3h)
    const [sendHour, sendMinute] = pref.send_time.split(":").map(Number);
    const rawDiff = Math.abs((currentHour * 60 + currentMinute) - (sendHour * 60 + sendMinute));
    const minutesDiff = Math.min(rawDiff, 1440 - rawDiff);

    if (minutesDiff > 90) {
      return { skipped: { email: userInfo.email, reason: "wrong time" } };
    }

    // Frequency check
    if (pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
      return { skipped: { email: userInfo.email, reason: "weekend" } };
    }
    if (pref.frequency === "custom" && !pref.custom_days?.includes(currentDay)) {
      return { skipped: { email: userInfo.email, reason: "not scheduled day" } };
    }

    const selectedWord = await selectBestWordForUser(supabase, pref.user_id);
    if (!selectedWord) {
      return { error: { email: userInfo.email, error: "No word available" } };
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("learning_goal")
      .eq("id", pref.user_id)
      .single();

    const aiContent = await getOrGenerateWordContent(supabase, {
      word_id: selectedWord.word.id,
      word: selectedWord.word.word,
      pos: selectedWord.word.pos,
      word_level: selectedWord.word.level,
      skill_level: selectedWord.skillLevel,
      learning_goal: profileData?.learning_goal || "daily",
    });

    const result = await sendDailyWordEmail({
      to: userInfo.email,
      userName: userInfo.name,
      word: selectedWord.word,
      aiContent: aiContent || null,
    });

    if (result.success) {
      await supabase
        .from("email_preferences")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("user_id", pref.user_id);

      return { sent: { email: userInfo.email, word: selectedWord.word.word, source: selectedWord.source } };
    } else {
      return { error: { email: userInfo.email, error: result.error } };
    }
  } catch (e) {
    return { error: { user_id: pref.user_id, error: e.message } };
  }
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: preferences, error: prefError } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("enabled", true);

  if (prefError) return Response.json({ error: prefError.message }, { status: 500 });

  if (!preferences?.length) {
    return Response.json({ success: true, message: "No users with email enabled", sent: 0 });
  }

  const userIds = preferences.map(p => p.user_id);

  const [{ data: profiles }, { data: authData }] = await Promise.all([
    supabase.from("profiles").select("*").in("id", userIds),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const userMap = {};
  for (const profile of profiles || []) {
    const authUser = authData.users.find(u => u.id === profile.id);
    userMap[profile.id] = {
      email: profile.email || authUser?.email,
      name: profile.name || authUser?.email?.split("@")[0],
      timezone: profile.timezone || "Asia/Ho_Chi_Minh",
    };
  }

  // Xử lý song song tất cả users
  const results = await Promise.all(
    preferences.map(pref => processUser(supabase, pref, userMap[pref.user_id], now))
  );

  const sentTo = results.filter(r => r.sent).map(r => r.sent);
  const skipped = results.filter(r => r.skipped).map(r => r.skipped);
  const errors = results.filter(r => r.error).map(r => r.error);

  return Response.json({
    success: true,
    timestamp: now.toISOString(),
    total: preferences.length,
    sent: sentTo.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { sentTo, skipped, errors },
  });
}
