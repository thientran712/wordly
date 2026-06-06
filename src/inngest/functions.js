import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser, markWordEmailed } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

// Returns the next UTC Date when sendTime (HH:MM) occurs in the given timezone.
function getNextSendDate(sendTime, timezone) {
  const parts = sendTime.split(":");
  const sendHour = parseInt(parts[0]);
  const sendMinute = parseInt(parts[1]);
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

// Triggered when user saves email settings — schedules one function per slot
export const scheduleAllSlots = inngest.createFunction(
  {
    id: "schedule-all-slots",
    triggers: [{ event: "email/schedule.updated" }],
  },
  async ({ event, step }) => {
    const { user_id } = event.data;

    const slots = await step.run("load-slots", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("email_slots")
        .select("*")
        .eq("user_id", user_id)
        .eq("enabled", true);
      return data || [];
    });

    // Fire one event per slot
    if (slots.length > 0) {
      await step.sendEvent(
        "trigger-slots",
        slots.map(slot => ({
          name: "email/slot.scheduled",
          data: { user_id, slot_id: slot.id },
        }))
      );
    }

    return { scheduled: slots.length };
  }
);

// One function per slot — sleeps until exact send time then sends
export const sendSlotEmail = inngest.createFunction(
  {
    id: "send-slot-email",
    triggers: [{ event: "email/slot.scheduled" }],
    cancelOn: [
      {
        event: "email/slot.cancelled",
        if: "event.data.slot_id == async.data.slot_id",
      },
    ],
  },
  async ({ event, step }) => {
    const { user_id, slot_id } = event.data;

    // Load slot + user info
    const ctx = await step.run("load-context", async () => {
      const supabase = createAdminClient();
      const [{ data: slot }, { data: pref }, { data: profile }, { data: authData }] = await Promise.all([
        supabase.from("email_slots").select("*").eq("id", slot_id).single(),
        supabase.from("email_preferences").select("*").eq("user_id", user_id).single(),
        supabase.from("profiles").select("email, name, timezone, learning_goal").eq("id", user_id).single(),
        supabase.auth.admin.getUserById(user_id),
      ]);
      return {
        slot,
        pref,
        email: profile?.email || authData?.user?.email,
        name: profile?.name || authData?.user?.email?.split("@")[0],
        timezone: profile?.timezone || "Asia/Ho_Chi_Minh",
        learning_goal: profile?.learning_goal || "daily",
      };
    });

    if (!ctx.slot?.enabled) return { skipped: "slot disabled" };
    if (!ctx.pref?.enabled) return { skipped: "email disabled" };

    const nextSendDate = getNextSendDate(ctx.slot.send_time, ctx.timezone);
    await step.sleepUntil("wait-until-send-time", nextSendDate);

    // Re-check after sleep
    const current = await step.run("recheck", async () => {
      const supabase = createAdminClient();
      const [{ data: slot }, { data: pref }] = await Promise.all([
        supabase.from("email_slots").select("*").eq("id", slot_id).single(),
        supabase.from("email_preferences").select("*").eq("user_id", user_id).single(),
      ]);
      return { slot, pref };
    });

    if (!current.slot?.enabled) return { skipped: "slot disabled after sleep" };
    if (!current.pref?.enabled) return { skipped: "email disabled after sleep" };

    // Frequency check
    const now = new Date();
    const userNow = new Date(now.toLocaleString("en-US", { timeZone: ctx.timezone }));
    const currentDay = userNow.getDay();
    if (current.pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
      // Still reschedule for tomorrow even if skipping today
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id } });
      return { skipped: "weekend" };
    }
    if (current.pref.frequency === "custom" && !current.pref.custom_days?.includes(currentDay)) {
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id } });
      return { skipped: "not scheduled day" };
    }

    const sendResult = await step.run("send-email", async () => {
      const supabase = createAdminClient();

      const selectedWord = await selectBestWordForUser(supabase, user_id);
      if (!selectedWord) return { error: "No word available" };

      const isUserWord = selectedWord.source === "journal" || selectedWord.source === "translate_history";

      let aiContent = null;
      if (!isUserWord) {
        const { data: profileData } = await supabase
          .from("profiles").select("learning_goal").eq("id", user_id).single();
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
        to: ctx.email,
        userName: ctx.name,
        word: selectedWord.word,
        aiContent: aiContent || null,
        source: selectedWord.source,
      });

      if (result.success) {
        // Update slot last_sent_at
        await supabase
          .from("email_slots")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", slot_id);

        // Mark word as emailed (updates last_emailed_at on journal/translate_history)
        await markWordEmailed(supabase, selectedWord);

        if (!isUserWord) {
          await supabase
            .from("email_preferences")
            .update({ last_sent_word_id: selectedWord.word.id })
            .eq("user_id", user_id);

          const { data: existing } = await supabase
            .from("user_progress").select("word_id")
            .eq("user_id", user_id).eq("word_id", selectedWord.word.id).single();

          if (!existing) {
            await supabase.from("user_progress").insert({
              user_id,
              word_id: selectedWord.word.id,
              state: "new", stability: null, difficulty: null, due_at: null,
              scheduled_days: 0, elapsed_days: 0, lapses: 0, review_count: 0,
              last_reviewed_at: null, is_bookmarked: false,
            });
          }
        }

        return { sent: true, word: selectedWord.word.word, source: selectedWord.source };
      }
      return { error: result.error };
    });

    // Reschedule for tomorrow
    await step.sendEvent("reschedule-tomorrow", {
      name: "email/slot.scheduled",
      data: { user_id, slot_id },
    });

    return sendResult;
  }
);
