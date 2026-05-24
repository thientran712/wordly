import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

// Returns the next UTC Date when sendTime (HH:MM) occurs in the given timezone.
// Assumes server runs in UTC (Vercel default).
function getNextSendDate(sendTime, timezone) {
  const [sendHour, sendMinute] = sendTime.split(":").map(Number);
  const now = new Date();
  const userNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const candidate = new Date(userNow);
  candidate.setHours(sendHour, sendMinute, 0, 0);
  if (userNow >= candidate) {
    candidate.setDate(candidate.getDate() + 1);
  }
  const offset = userNow.getTime() - now.getTime();
  return new Date(candidate.getTime() - offset);
}

export const scheduleDailyEmail = inngest.createFunction(
  {
    id: "schedule-daily-email",
    triggers: [{ event: "email/schedule.updated" }],
    cancelOn: [
      {
        event: "email/schedule.updated",
        if: "event.data.user_id == async.data.user_id",
      },
    ],
  },
  async ({ event, step }) => {
    const { user_id } = event.data;

    const prefs = await step.run("load-preferences", async () => {
      const supabase = createAdminClient();
      const { data: pref } = await supabase
        .from("email_preferences")
        .select("*")
        .eq("user_id", user_id)
        .single();
      const { data: profiles } = await supabase
        .from("profiles")
        .select("email, name, timezone")
        .eq("id", user_id)
        .single();
      const { data: authData } = await supabase.auth.admin.getUserById(user_id);
      return {
        pref,
        email: profiles?.email || authData?.user?.email,
        name: profiles?.name || authData?.user?.email?.split("@")[0],
        timezone: profiles?.timezone || "Asia/Ho_Chi_Minh",
      };
    });

    if (!prefs?.pref?.enabled) return { skipped: "not enabled" };

    const nextSendDate = getNextSendDate(prefs.pref.send_time, prefs.timezone);

    await step.sleepUntil("wait-until-send-time", nextSendDate);

    // Re-fetch preferences in case they changed during the sleep
    const currentPrefs = await step.run("recheck-preferences", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("email_preferences")
        .select("*")
        .eq("user_id", user_id)
        .single();
      return data;
    });

    if (!currentPrefs?.enabled) return { skipped: "disabled after sleep" };

    // Frequency check
    const sendResult = await step.run("send-email", async () => {
      const supabase = createAdminClient();
      const now = new Date();
      const userNow = new Date(now.toLocaleString("en-US", { timeZone: prefs.timezone }));
      const currentDay = userNow.getDay();

      if (currentPrefs.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
        return { skipped: "weekend" };
      }
      if (currentPrefs.frequency === "custom" && !currentPrefs.custom_days?.includes(currentDay)) {
        return { skipped: "not scheduled day" };
      }

      const selectedWord = await selectBestWordForUser(supabase, user_id);
      if (!selectedWord) return { error: "No word available" };

      const { data: profileData } = await supabase
        .from("profiles")
        .select("learning_goal")
        .eq("id", user_id)
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
        to: prefs.email,
        userName: prefs.name,
        word: selectedWord.word,
        aiContent: aiContent || null,
      });

      if (result.success) {
        const sentAt = new Date().toISOString();
        await supabase
          .from("email_preferences")
          .update({ last_sent_at: sentAt, last_sent_word_id: selectedWord.word.id })
          .eq("user_id", user_id);

        // Pre-add vào user_progress (state=new) nếu chưa từng học
        const { data: existing } = await supabase
          .from("user_progress")
          .select("word_id")
          .eq("user_id", user_id)
          .eq("word_id", selectedWord.word.id)
          .single();

        if (!existing) {
          await supabase.from("user_progress").insert({
            user_id,
            word_id: selectedWord.word.id,
            state: "new",
            stability: null,
            difficulty: null,
            due_at: null,
            scheduled_days: 0,
            elapsed_days: 0,
            lapses: 0,
            review_count: 0,
            last_reviewed_at: null,
            is_bookmarked: false,
          });
        }

        return { sent: true, word: selectedWord.word.word };
      }
      return { error: result.error };
    });

    // Re-trigger for the next day
    await step.sendEvent("schedule-next-day", {
      name: "email/schedule.updated",
      data: { user_id },
    });

    return sendResult;
  }
);
