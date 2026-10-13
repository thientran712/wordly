// Giờ nhắc (email + push) chỉ theo mốc :00/:30 — spec 2026-10-13 mục 9.
// Mốc 30 phút + không trùng ⇒ hai khung bất kỳ của một người cách nhau ≥ 30
// phút, không phải tính khoảng cách. Khung giờ lẻ cũ vẫn gửi bình thường; luật
// này chỉ chặn khi ĐẶT giờ mới.

export const HALF_HOUR_ERROR = "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)";

export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** "8:30" | "08:30" | "08:30:00" → "08:30"; sai định dạng → null. */
export function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  if (h > 23 || min > 59 || sec !== 0) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function isHalfHour(value) {
  const t = normalizeTime(value);
  return t !== null && (t.endsWith(":00") || t.endsWith(":30"));
}

/** Giờ mới cho một khung: phải là mốc :00/:30 và không trùng `otherTimes`. */
export function checkSlotTime(value, otherTimes = []) {
  const time = normalizeTime(value);
  if (!time || !isHalfHour(time)) return { ok: false, error: HALF_HOUR_ERROR };
  if (otherTimes.map(normalizeTime).includes(time)) return { ok: false, error: `Đã có khung giờ ${time}` };
  return { ok: true, time };
}
