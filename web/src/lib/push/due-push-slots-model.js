// Bản JS của hàm SQL due_push_slots (migration 20261014000100) — để test mọi
// máy (không cần Postgres) và để test RLS đối chiếu kết quả với hàm SQL thật.
// Sửa một bên phải sửa cả bên kia.
import { safeTimezone, localParts, isScheduledDay } from "../email/cron-schedule.js";

export function duePushSlotsModel({ slots, preferences, profiles, devices, logs, now, catchupMinutes = 30 }) {
  const prefBy = new Map(preferences.filter((p) => p.enabled).map((p) => [p.user_id, p]));
  const tzBy = new Map(profiles.map((p) => [p.id, p.timezone]));
  const hasDevice = new Set(devices.map((d) => d.user_id));
  const logged = new Set(logs.map((l) => `${l.slot_id}|${l.send_date}`));
  const out = [];

  for (const s of slots) {
    if (!s.enabled || !hasDevice.has(s.user_id)) continue;
    const pref = prefBy.get(s.user_id);
    if (!pref) continue;
    const local = localParts(now, safeTimezone(tzBy.get(s.user_id)));
    const [h, m] = s.send_time.split(":").map(Number);
    const nowMin = local.hour * 60 + local.minute + local.second / 60;

    // Hôm nay, hoặc hôm qua khi cửa sổ bù vắt qua nửa đêm (hẹn 23:30, giờ 00:05)
    for (const back of [0, 1]) {
      const late = nowMin + back * 1440 - (h * 60 + m);
      if (late < 0 || late >= catchupMinutes) continue;
      const day = new Date(Date.UTC(local.year, local.month, local.day - back));
      const sendDate = day.toISOString().slice(0, 10);
      if (!isScheduledDay(pref.frequency, pref.custom_days, day.getUTCDay())) continue;
      if (logged.has(`${s.id}|${sendDate}`)) continue;
      out.push({ slot_id: s.id, user_id: s.user_id, send_date: sendDate });
    }
  }
  return out;
}
