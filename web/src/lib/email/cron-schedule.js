// Thay Inngest sleepUntil bằng polling: cron VPS gọi /api/cron/send-emails
// mỗi vài phút, hàm này trả lời "slot này có tới giờ gửi ngay bây giờ không".

export function safeTimezone(tz) {
  if (!tz || typeof tz !== "string") return "Asia/Ho_Chi_Minh";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "Asia/Ho_Chi_Minh";
  }
}

const DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    year: parseInt(get("year")), month: parseInt(get("month")) - 1, day: parseInt(get("day")),
    hour: parseInt(get("hour")), minute: parseInt(get("minute")), second: parseInt(get("second")),
    weekday: DOW_MAP[get("weekday")] ?? 0,
  };
}

export function isScheduledDay(frequency, customDays, dayOfWeek) {
  if (frequency === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5;
  if (frequency === "custom") return Array.isArray(customDays) && customDays.includes(dayOfWeek);
  return true; // "daily" hoặc không đặt — gửi mọi ngày
}

/**
 * Slot có tới giờ gửi trong cửa sổ [sendTime, sendTime + windowMinutes) hôm nay
 * (theo giờ địa phương của slot) không? Cron gọi hàm này mỗi windowMinutes phút
 * — cửa sổ phải >= chu kỳ cron để không bỏ sót slot nào.
 */
export function isSlotDueNow({ sendTime, timezone, frequency, customDays, now, windowMinutes }) {
  if (!sendTime || typeof sendTime !== "string") return false;
  const [sendHour, sendMinute] = sendTime.split(":").map(Number);
  if (Number.isNaN(sendHour) || Number.isNaN(sendMinute)) return false;

  const tz = safeTimezone(timezone);
  const local = localParts(now, tz);

  if (!isScheduledDay(frequency, customDays, local.weekday)) return false;

  const nowMinutesOfDay = local.hour * 60 + local.minute + local.second / 60;
  const sendMinutesOfDay = sendHour * 60 + sendMinute;
  const diff = nowMinutesOfDay - sendMinutesOfDay;

  return diff >= 0 && diff < windowMinutes;
}
