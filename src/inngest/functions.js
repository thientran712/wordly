import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { claimBestWordForUser } from "@/lib/select-word-for-email";

// Validate a timezone string; fall back to Asia/Ho_Chi_Minh if invalid/empty.
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

  // UTC offset: difference between "local now" expressed in UTC vs actual UTC
  const userLocalNow = Date.UTC(year, month, day, currentHour, currentMinute, currentSecond);
  const utcOffset = userLocalNow - now.getTime();

  let candidateLocal = Date.UTC(year, month, day, sendHour, sendMinute, 0, 0);
  const candidateUTC = candidateLocal - utcOffset;

  // Grace period: if send_time passed but less than 2 minutes ago, fire immediately.
  // Handles Inngest/Vercel latency when user saves a slot just before its send_time.
  const GRACE_MS = 2 * 60 * 1000;
  if (candidateUTC <= now.getTime()) {
    if (now.getTime() - candidateUTC <= GRACE_MS) {
      return new Date(now.getTime() + 2000);
    }
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
      const cancelledAt = Date.now();
      // Schedule events use cancelledAt + 1 so the cancelOn guard
      // (triggeredAt >= async.triggeredAt) never matches the new runs.
      const scheduledAt = cancelledAt + 1;

      await step.sendEvent("cancel-existing", slots.map(slot => ({
        name: "email/slot.cancelled",
        data: { user_id, slot_id: slot.id, triggeredAt: cancelledAt },
      })));

      // Sleep inside Inngest so cancels propagate before new runs start
      await step.sleep("wait-for-cancels", "3s");

      await step.sendEvent(
        "trigger-slots",
        slots.map(slot => ({
          name: "email/slot.scheduled",
          data: { user_id, slot_id: slot.id, triggeredAt: scheduledAt },
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
        if: "event.data.slot_id == async.data.slot_id && event.data.triggeredAt >= async.data.triggeredAt",
      },
    ],
  },
  async ({ event, step }) => {
    const { user_id, slot_id } = event.data;

    // ── Step 1: load only what's needed to compute the schedule ──────────────
    const sched = await step.run("load-schedule", async () => {
      const supabase = createAdminClient();
      const [{ data: slot }, { data: pref }, { data: profile }] = await Promise.all([
        supabase.from("email_slots").select("enabled, send_time").eq("id", slot_id).single(),
        supabase.from("email_preferences").select("enabled").eq("user_id", user_id).single(),
        supabase.from("profiles").select("timezone").eq("id", user_id).single(),
      ]);

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

    // If slot/pref is disabled, still update heartbeat so watchdog doesn't loop.
    if (!sched.slotEnabled || !sched.prefEnabled || !sched.sendTime) {
      if (!sched.slotEnabled || !sched.prefEnabled) {
        const supabase = createAdminClient();
        await supabase.from("email_slots")
          .update({ last_scheduled_at: new Date().toISOString() })
          .eq("id", slot_id);
      }
      return { skipped: !sched.slotEnabled ? "slot disabled" : !sched.prefEnabled ? "email disabled" : "no send_time" };
    }

    // nextSendDate is the authoritative timestamp for this run — used as reference
    // for day-of-week check and todayStr so Inngest wake-up latency can't shift them.
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

    // Frequency check — use nextSendDate (not new Date()) as reference so
    // Inngest wake-up latency can never shift the day-of-week into the next day.
    const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: current.timezone, weekday: "short",
    }).formatToParts(nextSendDate);
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
    // Anchor todayStr to nextSendDate (not new Date()) so midnight latency can't
    // cause a mismatch between the intended send date and what gets written to DB.
    const todayStr = dateStrInTz(nextSendDate, current.timezone);
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

    // ── Step 4: atomically claim a word from journal / translate history ────────
    const wordResult = await step.run("claim-word", async () => {
      const supabase = createAdminClient();
      const selectedWord = await claimBestWordForUser(supabase, user_id);
      if (!selectedWord) {
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

    // ── Step 5: send the email ────────────────────────────────────────────────
    const sendResult = await step.run("send-email", async () => {
      const result = await sendDailyWordEmail({
        to: current.email,
        userName: current.name,
        word: wordResult.word,
        aiContent: null,
        source: wordResult.source,
      });
      return { success: result.success, error: result.error || null, id: result.id || null };
    });

    // ── Step 6: log outcome ───────────────────────────────────────────────────
    await step.run("track-and-log", async () => {
      const supabase = createAdminClient();

      if (sendResult.success) {
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

    if (!sendResult.success) {
      throw new Error(`Email send failed: ${sendResult.error}`);
    }

    await step.sendEvent("reschedule-tomorrow", {
      name: "email/slot.scheduled",
      data: { user_id, slot_id, triggeredAt: Date.now() },
    });

    return { sent: true, word: wordResult.word.word, source: wordResult.source };
  }
);

// ── WATCHDOG: self-healing scheduler ─────────────────────────────────────────
export const watchdogReschedule = inngest.createFunction(
  {
    id: "watchdog-reschedule",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const stale = await step.run("find-stale-slots", async () => {
      const supabase = createAdminClient();

      const { data: enabledPrefs } = await supabase
        .from("email_preferences").select("user_id").eq("enabled", true);
      const enabledUsers = new Set((enabledPrefs || []).map(p => p.user_id));
      if (enabledUsers.size === 0) return [];

      const { data: slots } = await supabase
        .from("email_slots")
        .select("id, user_id, last_scheduled_at")
        .eq("enabled", true);

      const cutoff = Date.now() - 25 * 60 * 60 * 1000;
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
