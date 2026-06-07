import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser, markWordEmailed } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

// Returns the next UTC Date when sendTime (HH:MM) occurs in the given timezone.
function getNextSendDate(sendTime, timezone) {
  const [sendHour, sendMinute] = sendTime.split(":").map(Number);
  const now = new Date();

  // Get user's current date components in their timezone
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parseInt(parts.find(p => p.type === type)?.value || "0");
  const year = get("year");
  const month = get("month") - 1;
  const day = get("day");
  const currentHour = get("hour");
  const currentMinute = get("minute");
  const currentSecond = get("second");

  // Build candidate send time in user's timezone as a UTC instant
  // We use the offset trick: find UTC offset by comparing UTC now vs user "local" now
  const userLocalNow = Date.UTC(year, month, day, currentHour, currentMinute, currentSecond);
  const utcOffset = userLocalNow - now.getTime(); // milliseconds ahead of UTC

  // Candidate: today at sendHour:sendMinute in user's timezone
  let candidateLocal = Date.UTC(year, month, day, sendHour, sendMinute, 0, 0);
  const candidateUTC = candidateLocal - utcOffset;

  // If that time has already passed (or is now), schedule for tomorrow
  if (candidateUTC <= now.getTime()) {
    candidateLocal = Date.UTC(year, month, day + 1, sendHour, sendMinute, 0, 0);
    return new Date(candidateLocal - utcOffset);
  }

  return new Date(candidateUTC);
}

// Triggered when user saves email settings — schedules one function per slot
export const scheduleAllSlots = inngest.createFunction(
  {
    id: "schedule-all-slots",
    triggers: [{ event: "email/schedule.updated" }],
    // Debounce: if same user saves multiple times within 5s, only run once with latest event
    debounce: { key: "event.data.user_id", period: "5s" },
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

    if (slots.length > 0) {
      // Only reschedule slots that haven't sent recently (avoid cancelling one about to fire)
      const now = new Date();
      const triggeredAt = now.getTime();
      const slotsToReschedule = slots.filter(slot => {
        if (!slot.last_sent_at) return true;
        const sentMs = new Date(slot.last_sent_at).getTime();
        return (triggeredAt - sentMs) > 60 * 60 * 1000; // sent more than 1h ago
      });

      if (slotsToReschedule.length > 0) {
        // Cancel existing runs first
        await step.sendEvent("cancel-existing", slotsToReschedule.map(slot => ({
          name: "email/slot.cancelled",
          data: { user_id, slot_id: slot.id, triggeredAt },
        })));

        // Sleep inside Inngest (doesn't block Vercel) then fire new runs
        await step.sleep("wait-for-cancels", "3s");

        await step.sendEvent(
          "trigger-slots",
          slotsToReschedule.map(slot => ({
            name: "email/slot.scheduled",
            data: { user_id, slot_id: slot.id, triggeredAt },
          }))
        );
      }
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
        // Only cancel if the cancel event was triggered AFTER this run's scheduled event
        // This prevents a stale cancel (from a previous update) from killing a newer run
        if: "event.data.slot_id == async.data.slot_id && event.data.triggeredAt >= async.data.triggeredAt",
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
        email: authData?.user?.email || profile?.email,
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

    // Frequency check — get day-of-week in user's timezone (0=Sun … 6=Sat)
    const now = new Date();
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: ctx.timezone, weekday: "short",
    }).formatToParts(now);
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dowMap[tzParts.find(p => p.type === "weekday")?.value] ?? 0;
    if (current.pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id, triggeredAt: Date.now() } });
      return { skipped: "weekend" };
    }
    if (current.pref.frequency === "custom" && !current.pref.custom_days?.includes(currentDay)) {
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id, triggeredAt: Date.now() } });
      return { skipped: "not scheduled day" };
    }

    const sendResult = await step.run("send-email", async () => {
      const supabase = createAdminClient();

      // Idempotency: skip if sent within last 60 minutes (blocks retries and duplicates)
      const { data: slotNow } = await supabase
        .from("email_slots").select("last_sent_at").eq("id", slot_id).single();
      if (slotNow?.last_sent_at) {
        const minutesSinceSent = (Date.now() - new Date(slotNow.last_sent_at).getTime()) / 60000;
        if (minutesSinceSent < 60) {
          return { skipped: `already sent ${Math.round(minutesSinceSent)}min ago` };
        }
      }

      const selectedWord = await selectBestWordForUser(supabase, user_id);
      if (!selectedWord) return { error: "No word available" };

      // Mark slot sent + word emailed BEFORE sending to prevent race condition and retries
      await supabase
        .from("email_slots")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", slot_id);
      await markWordEmailed(supabase, selectedWord);

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

    // Reschedule for tomorrow — new triggeredAt so stale cancels can't kill it
    await step.sendEvent("reschedule-tomorrow", {
      name: "email/slot.scheduled",
      data: { user_id, slot_id, triggeredAt: Date.now() },
    });

    return sendResult;
  }
);
