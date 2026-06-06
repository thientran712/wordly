import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser, markWordEmailed } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";
import { validateCronSecret } from "@/lib/validate-cron-secret";

export const maxDuration = 60;

async function processSlot(supabase, slot, userInfo, now) {
  try {
    if (!userInfo?.email) return { skipped: { slot_id: slot.id, reason: "no email" } };
    if (!slot.enabled) return { skipped: { slot_id: slot.id, reason: "slot disabled" } };

    const userNow = new Date(now.toLocaleString("en-US", { timeZone: userInfo.timezone }));

    // Already sent for this slot today?
    if (slot.last_sent_at) {
      const lastSentUserTime = new Date(new Date(slot.last_sent_at).toLocaleString("en-US", { timeZone: userInfo.timezone }));
      if (lastSentUserTime.toDateString() === userNow.toDateString()) {
        return { skipped: { slot_id: slot.id, reason: "already sent today" } };
      }
    }

    // Time window check (±90 min)
    const [sendHour, sendMinute] = slot.send_time.split(":").map(Number);
    const currentMinutes = userNow.getHours() * 60 + userNow.getMinutes();
    const slotMinutes = sendHour * 60 + sendMinute;
    const rawDiff = Math.abs(currentMinutes - slotMinutes);
    const minutesDiff = Math.min(rawDiff, 1440 - rawDiff);
    if (minutesDiff > 90) return { skipped: { slot_id: slot.id, reason: "wrong time" } };

    // Frequency check (from email_preferences)
    const { data: pref } = await supabase
      .from("email_preferences")
      .select("frequency, custom_days, enabled")
      .eq("user_id", slot.user_id)
      .single();

    if (!pref?.enabled) return { skipped: { slot_id: slot.id, reason: "email disabled" } };

    const currentDay = userNow.getDay();
    if (pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
      return { skipped: { slot_id: slot.id, reason: "weekend" } };
    }
    if (pref.frequency === "custom" && !pref.custom_days?.includes(currentDay)) {
      return { skipped: { slot_id: slot.id, reason: "not scheduled day" } };
    }

    const selectedWord = await selectBestWordForUser(supabase, slot.user_id);
    if (!selectedWord) return { error: { slot_id: slot.id, error: "No word available" } };

    const isUserWord = selectedWord.source === "journal" || selectedWord.source === "translate_history";

    let aiContent = null;
    if (!isUserWord) {
      const { data: profileData } = await supabase
        .from("profiles").select("learning_goal").eq("id", slot.user_id).single();
      aiContent = await getOrGenerateWordContent(supabase, {
        word_id: selectedWord.word.id,
        word: selectedWord.word.word,
        pos: selectedWord.word.pos,
        word_level: selectedWord.word.level,
        skill_level: selectedWord.skillLevel,
        learning_goal: profileData?.learning_goal || "daily",
      });
    }

    const result = await sendDailyWordEmail({
      to: userInfo.email,
      userName: userInfo.name,
      word: selectedWord.word,
      aiContent: aiContent || null,
      source: selectedWord.source,
    });

    if (result.success) {
      await supabase
        .from("email_slots")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", slot.id);

      await markWordEmailed(supabase, selectedWord);

      if (!isUserWord) {
        await supabase
          .from("email_preferences")
          .update({ last_sent_word_id: selectedWord.word.id })
          .eq("user_id", slot.user_id);

        const { data: existingProgress } = await supabase
          .from("user_progress").select("word_id")
          .eq("user_id", slot.user_id).eq("word_id", selectedWord.word.id).single();

        if (!existingProgress) {
          await supabase.from("user_progress").insert({
            user_id: slot.user_id,
            word_id: selectedWord.word.id,
            state: "new", stability: null, difficulty: null, due_at: null,
            scheduled_days: 0, elapsed_days: 0, lapses: 0, review_count: 0,
            last_reviewed_at: null, is_bookmarked: false,
          });
        }
      }

      return { sent: { email: userInfo.email, word: selectedWord.word.word, source: selectedWord.source, slot_time: slot.send_time } };
    } else {
      return { error: { slot_id: slot.id, error: result.error } };
    }
  } catch (e) {
    return { error: { slot_id: slot.id, error: e.message } };
  }
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const { data: slots, error: slotsError } = await supabase
    .from("email_slots")
    .select("*")
    .eq("enabled", true);

  if (slotsError) return Response.json({ error: slotsError.message }, { status: 500 });
  if (!slots?.length) return Response.json({ success: true, message: "No slots", sent: 0 });

  const userIds = [...new Set(slots.map(s => s.user_id))];
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

  const results = await Promise.all(
    slots.map(slot => processSlot(supabase, slot, userMap[slot.user_id], now))
  );

  const sentTo = results.filter(r => r.sent).map(r => r.sent);
  const skipped = results.filter(r => r.skipped).map(r => r.skipped);
  const errors = results.filter(r => r.error).map(r => r.error);

  return Response.json({
    success: true,
    timestamp: now.toISOString(),
    total_slots: slots.length,
    sent: sentTo.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { sentTo, skipped, errors },
  });
}
