import { isSlotDueNow } from "./cron-schedule.js";
import { fetchAllRows } from "../supabase/fetch-all-rows.js";

/** Slot đang bật nào tới giờ gửi ngay bây giờ. Trả cả số slot đã xét.
 * Lấy theo trang — PostgREST cắt mỗi request ở 1000 dòng, trước đây người
 * dùng thứ 1.001+ không bao giờ nhận email. */
export async function findDueSlots(supabase, now, windowMinutes) {
  const [prefs, profiles, slots] = await Promise.all([
    fetchAllRows(() => supabase.from("email_preferences").select("user_id, enabled, frequency, custom_days").eq("enabled", true),
      { orderBy: "user_id" }),
    fetchAllRows(() => supabase.from("profiles").select("id, timezone")),
    fetchAllRows(() => supabase.from("email_slots").select("id, user_id, enabled, send_time").eq("enabled", true)),
  ]);

  const prefByUser = new Map(prefs.map(p => [p.user_id, p]));
  const tzByUser = new Map(profiles.map(p => [p.id, p.timezone]));

  const dueSlots = slots.filter(slot => {
    const pref = prefByUser.get(slot.user_id);
    if (!pref) return false;
    return isSlotDueNow({
      sendTime: slot.send_time,
      timezone: tzByUser.get(slot.user_id),
      frequency: pref.frequency,
      customDays: pref.custom_days,
      now,
      windowMinutes,
    });
  });

  return { checked: slots.length, dueSlots };
}
