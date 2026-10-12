// Thay cho Inngest (scheduleAllSlots/sendSlotEmail/watchdogReschedule) —
// cron VPS gọi POST /api/cron/send-emails mỗi 5 phút, hàm này tự hỏi DB
// "ai tới giờ gửi ngay bây giờ" (polling) thay vì Inngest "ngủ" tới đúng giờ.
// Xem docs/superpowers/specs/2026-10-10-cron-email-design.md.
import { isSlotDueNow } from "./cron-schedule.js";
import { sendDailyWordEmail } from "./send-email.js";
import { selectEmailContent, selectBankWords } from "./select-word-for-email.js";

const WINDOW_MINUTES = 5; // phải >= chu kỳ crontab gọi endpoint này

/** Đã gửi "sent" cho slot này trong hôm nay chưa — chặn gửi trùng nếu cron
 * chạy lố cửa sổ (ví dụ VPS treo rồi chạy bù). */
async function alreadySentToday(supabase, slotId, now) {
  const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const { data } = await supabase
    .from("email_log")
    .select("id")
    .eq("slot_id", slotId)
    .eq("status", "sent")
    .gte("created_at", startOfDayUTC)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function sendForSlot(supabase, { user_id, slot_id }) {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await supabase
    .from("suggestion_log")
    .select("entry_id")
    .eq("user_id", user_id)
    .in("entry_type", ["translate_history", "journal_entries"])
    .gte("shown_at", since);
  const recentIds = (recentLogs || []).map(l => l.entry_id).filter(Boolean);

  const picked = await selectEmailContent(supabase, user_id, { lastEntryIds: recentIds });

  const bankSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: bankLogs } = await supabase
    .from("email_log")
    .select("entry_ids")
    .eq("user_id", user_id)
    .eq("status", "sent")
    .gte("created_at", bankSince);
  const bankWords = await selectBankWords(supabase, user_id, {
    count: 1,
    recentIds: (bankLogs || []).flatMap(l => l.entry_ids || []),
  }).catch(() => []);

  const words = [...(picked?.words || []), ...bankWords];
  const journal = picked?.journal || null;
  if (words.length === 0 && !journal) {
    await supabase.from("email_log").insert({
      user_id, slot_id, status: "failed", error: "Nothing to send — both queues empty",
    });
    return { skipped: "empty" };
  }

  const { data: profile } = await supabase.from("profiles").select("name").eq("id", user_id).single();
  const { data: authData } = await supabase.auth.admin.getUserById(user_id);
  const email = authData?.user?.email;
  if (!email) return { skipped: "no email" };
  const name = profile?.name || email.split("@")[0] || "there";

  const result = await sendDailyWordEmail({ to: email, userName: name, words, journal });

  const entryIds = [...words.map(w => w.id), ...(journal ? [journal.id] : [])];
  await supabase.from("email_log").insert({
    user_id, slot_id,
    status: result.success ? "sent" : "failed",
    word: words.map(w => w.word).join(", ") || null,
    source: "unified",
    entry_ids: entryIds,
    recipient: email,
    error: result.success ? null : result.error,
  });

  if (!result.success) return { error: result.error };

  const rows = [
    ...words.map(w => w.step === "bank"
      ? { user_id, source: "email", entry_type: "bank", bank_word_id: w.id }
      : { user_id, source: "email", entry_type: "translate_history", entry_id: w.id }),
    ...(journal ? [{ user_id, source: "email", entry_type: "journal_entries", entry_id: journal.id }] : []),
  ];
  const { error: logError } = await supabase.from("suggestion_log").insert(rows);
  if (logError) console.error(`[cron-send-emails] log-suggestions thất bại (không fatal): ${logError.message}`);

  return { sent: true };
}

/** Quét toàn bộ slot đang bật, gửi email cho những slot tới giờ — gọi từ
 * route cron. `now` truyền vào để test được (mặc định new Date()). */
export async function runDueEmailSends(supabase, now = new Date()) {
  const [{ data: prefs }, { data: profiles }, { data: slots }] = await Promise.all([
    supabase.from("email_preferences").select("user_id, enabled, frequency, custom_days").eq("enabled", true),
    supabase.from("profiles").select("id, timezone"),
    supabase.from("email_slots").select("id, user_id, enabled, send_time").eq("enabled", true),
  ]);

  const prefByUser = new Map((prefs || []).map(p => [p.user_id, p]));
  const tzByUser = new Map((profiles || []).map(p => [p.id, p.timezone]));

  const dueSlots = (slots || []).filter(slot => {
    const pref = prefByUser.get(slot.user_id);
    if (!pref) return false;
    return isSlotDueNow({
      sendTime: slot.send_time,
      timezone: tzByUser.get(slot.user_id),
      frequency: pref.frequency,
      customDays: pref.custom_days,
      now,
      windowMinutes: WINDOW_MINUTES,
    });
  });

  const results = [];
  for (const slot of dueSlots) {
    if (await alreadySentToday(supabase, slot.id, now)) {
      results.push({ slot_id: slot.id, skipped: "already sent today" });
      continue;
    }
    const r = await sendForSlot(supabase, { user_id: slot.user_id, slot_id: slot.id });
    results.push({ slot_id: slot.id, ...r });
  }

  return { checked: (slots || []).length, due: dueSlots.length, results };
}
