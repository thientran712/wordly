import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { claimBestWordForUser } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

// Validate a timezone string; fall back to Asia/Ho_Chi_Minh if invalid/empty.
// Prevents Intl.DateTimeFormat from throwing (which would crash the whole run).
function safeTimezone(tz) {
  if (!tz || typeof tz !== "string") return "Asia/Ho_Chi_Minh";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

// Returns YYYY-MM-DD for the given date in the given timezone.
function dateStrInTz(date, timezone) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const g = (t) => p.find(x => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

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
      // Cancel + reschedule ALL enabled slots. Safe to cancel a slot that already
      // fired today: its run will re-sleep until tomorrow, and the last_sent_date
      // idempotency guard prevents any duplicate send. No fragile "sent <1h" filter.
      const triggeredAt = Date.now();

      await step.sendEvent("cancel-existing", slots.map(slot => ({
        name: "email/slot.cancelled",
        data: { user_id, slot_id: slot.id, triggeredAt },
      })));

      // Sleep inside Inngest (doesn't block Vercel) so cancels land first
      await step.sleep("wait-for-cancels", "3s");

      await step.sendEvent(
        "trigger-slots",
        slots.map(slot => ({
          name: "email/slot.scheduled",
          data: { user_id, slot_id: slot.id, triggeredAt },
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
        // Only cancel if the cancel event was triggered AFTER this run's scheduled event
        // This prevents a stale cancel (from a previous update) from killing a newer run
        if: "event.data.slot_id == async.data.slot_id && event.data.triggeredAt >= async.data.triggeredAt",
      },
    ],
  },
  async ({ event, step }) => {
    const { user_id, slot_id } = event.data;

    // ── Step 1: load only what's needed to compute the schedule ──────────────
    // Profile (name/email) is loaded AFTER sleep so it reflects any edits made
    // while sleeping. Here we only need send_time + timezone.
    const sched = await step.run("load-schedule", async () => {
      const supabase = createAdminClient();
      const [{ data: slot }, { data: pref }, { data: profile }] = await Promise.all([
        supabase.from("email_slots").select("enabled, send_time").eq("id", slot_id).single(),
        supabase.from("email_preferences").select("enabled").eq("user_id", user_id).single(),
        supabase.from("profiles").select("timezone").eq("id", user_id).single(),
      ]);

      // Heartbeat: mark that this slot has an active run, so the watchdog won't
      // mistake it for a dead slot. Updated on every (re)schedule.
      if (slot?.enabled) {
        await supabase.from("email_slots")
          .update({ last_scheduled_at: new Date().toISOString() })
          .eq("id", slot_id);
      }

      return {
        slotEnabled: slot?.enabled ?? false,
        sendTime: slot?.send_time,
        prefEnabled: pref?.enabled ?? false,
        timezone: safeTimezone(profile?.timezone),
      };
    });

    if (!sched.slotEnabled) return { skipped: "slot disabled" };
    if (!sched.prefEnabled) return { skipped: "email disabled" };
    if (!sched.sendTime) return { skipped: "slot has no send_time" };

    const nextSendDate = getNextSendDate(sched.sendTime, sched.timezone);
    await step.sleepUntil("wait-until-send-time", nextSendDate);

    // ── Step 2: re-check enabled + frequency AFTER sleep, reload fresh profile ─
    const current = await step.run("recheck", async () => {
      const supabase = createAdminClient();
      const [{ data: slot }, { data: pref }, { data: profile }, { data: authData }] = await Promise.all([
        supabase.from("email_slots").select("enabled, send_time").eq("id", slot_id).single(),
        supabase.from("email_preferences").select("enabled, frequency, custom_days").eq("user_id", user_id).single(),
        supabase.from("profiles").select("name, timezone, learning_goal, skill_level").eq("id", user_id).single(),
        supabase.auth.admin.getUserById(user_id),
      ]);
      return {
        slotEnabled: slot?.enabled ?? false,
        prefEnabled: pref?.enabled ?? false,
        frequency: pref?.frequency,
        customDays: pref?.custom_days,
        timezone: safeTimezone(profile?.timezone),
        email: authData?.user?.email || null,
        name: profile?.name || authData?.user?.email?.split("@")[0] || "there",
        learningGoal: profile?.learning_goal || "daily",
      };
    });

    if (!current.slotEnabled) return { skipped: "slot disabled after sleep" };
    if (!current.prefEnabled) return { skipped: "email disabled after sleep" };
    if (!current.email) return { skipped: "no email address" };

    // Frequency check — day-of-week in user's timezone (0=Sun … 6=Sat)
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: current.timezone, weekday: "short",
    }).formatToParts(new Date());
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const currentDay = dowMap[tzParts.find(p => p.type === "weekday")?.value] ?? 0;
    if (current.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id, triggeredAt: Date.now() } });
      return { skipped: "weekend" };
    }
    if (current.frequency === "custom" && !current.customDays?.includes(currentDay)) {
      await step.sendEvent("reschedule", { name: "email/slot.scheduled", data: { user_id, slot_id, triggeredAt: Date.now() } });
      return { skipped: "not scheduled day" };
    }

    // ── Step 3: atomically claim this slot for today (idempotency guard) ──────
    const todayStr = dateStrInTz(new Date(), current.timezone);
    const claimResult = await step.run("claim-slot", async () => {
      const supabase = createAdminClient();
      const { data: claimedSlot } = await supabase
        .from("email_slots")
        .update({ last_sent_date: todayStr, last_sent_at: new Date().toISOString() })
        .eq("id", slot_id)
        .or(`last_sent_date.is.null,last_sent_date.neq.${todayStr}`)
        .select("id")
        .maybeSingle();
      return { claimed: !!claimedSlot };
    });

    if (!claimResult.claimed) {
      await step.sendEvent("reschedule-tomorrow", {
        name: "email/slot.scheduled",
        data: { user_id, slot_id, triggeredAt: Date.now() },
      });
      return { skipped: `slot already sent today (${todayStr})` };
    }

    // ── Step 4: atomically claim a word (journal/translate dedup across slots) ─
    const wordResult = await step.run("claim-word", async () => {
      const supabase = createAdminClient();
      const selectedWord = await claimBestWordForUser(supabase, user_id);
      if (!selectedWord) {
        // No word → release slot claim so a future run can retry
        await supabase.from("email_slots").update({ last_sent_date: null }).eq("id", slot_id);
        return null;
      }
      return selectedWord;
    });

    if (!wordResult) {
      await step.run("log-no-word", async () => {
        const supabase = createAdminClient();
        await supabase.from("email_log").insert({
          user_id, slot_id, status: "failed", error: "No word available",
          recipient: current.email,
        });
      });
      await step.sendEvent("reschedule-tomorrow", {
        name: "email/slot.scheduled",
        data: { user_id, slot_id, triggeredAt: Date.now() },
      });
      return { error: "No word available" };
    }

    const isUserWord = wordResult.source === "journal" || wordResult.source === "translate_history";

    // ── Step 5: generate AI content (cached → idempotent on retry) ────────────
    let aiContent = null;
    if (!isUserWord) {
      aiContent = await step.run("generate-content", async () => {
        const supabase = createAdminClient();
        return await getOrGenerateWordContent(supabase, {
          word_id: wordResult.word.id,
          word: wordResult.word.word,
          pos: wordResult.word.pos,
          word_level: wordResult.word.level,
          skill_level: wordResult.skillLevel,
          learning_goal: current.learningGoal,
        });
      });
    }

    // ── Step 6: send the email (isolated step → retry only re-sends) ──────────
    const sendResult = await step.run("send-email", async () => {
      const result = await sendDailyWordEmail({
        to: current.email,
        userName: current.name,
        word: wordResult.word,
        aiContent: aiContent || null,
        source: wordResult.source,
      });
      return { success: result.success, error: result.error || null, id: result.id || null };
    });

    // ── Step 7: track progress + log outcome ─────────────────────────────────
    await step.run("track-and-log", async () => {
      const supabase = createAdminClient();

      if (sendResult.success) {
        if (!isUserWord) {
          await supabase.from("email_preferences")
            .update({ last_sent_word_id: wordResult.word.id }).eq("user_id", user_id);

          const { data: existing } = await supabase
            .from("user_progress").select("word_id")
            .eq("user_id", user_id).eq("word_id", wordResult.word.id).maybeSingle();
          if (!existing) {
            await supabase.from("user_progress").insert({
              user_id, word_id: wordResult.word.id,
              state: "new", stability: null, difficulty: null, due_at: null,
              scheduled_days: 0, elapsed_days: 0, lapses: 0, review_count: 0,
              last_reviewed_at: null, is_bookmarked: false,
            });
          }
        }
        await supabase.from("email_log").insert({
          user_id, slot_id, status: "sent",
          word: wordResult.word.word, source: wordResult.source,
          recipient: current.email,
        });
      } else {
        // Send failed → release slot claim so Inngest retry can re-fire today
        await supabase.from("email_slots").update({ last_sent_date: null }).eq("id", slot_id);
        await supabase.from("email_log").insert({
          user_id, slot_id, status: "failed", error: sendResult.error,
          word: wordResult.word.word, source: wordResult.source,
          recipient: current.email,
        });
      }
    });

    // If send failed, throw so Inngest retries this run. If all retries are
    // exhausted, the hourly watchdog will revive this slot within the hour,
    // so it can never be permanently dropped from the daily cycle.
    if (!sendResult.success) {
      throw new Error(`Email send failed: ${sendResult.error}`);
    }

    // Reschedule for tomorrow — new triggeredAt so stale cancels can't kill it
    await step.sendEvent("reschedule-tomorrow", {
      name: "email/slot.scheduled",
      data: { user_id, slot_id, triggeredAt: Date.now() },
    });

    return { sent: true, word: wordResult.word.word, source: wordResult.source };
  }
);

// ── WATCHDOG: self-healing scheduler ─────────────────────────────────────────
// Runs hourly. Finds every enabled slot belonging to a user with email enabled
// that has NO active run scheduled (detected via a heartbeat: last_scheduled_at).
// Re-fires email/slot.scheduled for them so a broken reschedule chain can never
// permanently stop a user's emails. The last_sent_date idempotency guard ensures
// this never causes a duplicate send.
export const watchdogReschedule = inngest.createFunction(
  {
    id: "watchdog-reschedule",
    // Hourly — cheap, and catches gaps within an hour of them appearing.
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const stale = await step.run("find-stale-slots", async () => {
      const supabase = createAdminClient();

      // Users who have email enabled
      const { data: enabledPrefs } = await supabase
        .from("email_preferences").select("user_id").eq("enabled", true);
      const enabledUsers = new Set((enabledPrefs || []).map(p => p.user_id));
      if (enabledUsers.size === 0) return [];

      // All enabled slots for those users
      const { data: slots } = await supabase
        .from("email_slots")
        .select("id, user_id, last_scheduled_at")
        .eq("enabled", true);

      const cutoff = Date.now() - 25 * 60 * 60 * 1000; // 25h: longer than one day cycle
      return (slots || [])
        .filter(s => enabledUsers.has(s.user_id))
        .filter(s => !s.last_scheduled_at || new Date(s.last_scheduled_at).getTime() < cutoff)
        .map(s => ({ user_id: s.user_id, slot_id: s.id }));
    });

    if (stale.length === 0) return { revived: 0 };

    await step.sendEvent("revive-slots", stale.map(s => ({
      name: "email/slot.scheduled",
      data: { user_id: s.user_id, slot_id: s.slot_id, triggeredAt: Date.now() },
    })));

    return { revived: stale.length };
  }
);
