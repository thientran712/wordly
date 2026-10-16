// Số build app gửi trong X-Wordly-Build (spec Pro §8) → ghi vào app_activity_daily.
// Bản cũ không gửi → null ("không rõ" trên trang thống kê).
export function buildFromHeader(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n < 1_000_000 ? n : null;
}
