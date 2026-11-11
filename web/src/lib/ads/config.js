// Quảng cáo mở app (chủ dự án chốt 11/11/2026): một loại duy nhất — mở app lạnh,
// tối đa ADS_APP_OPEN_PER_DAY lần/ngày. ADS_ENABLED mặc định TẮT = công tắc khẩn,
// tắt được ngay không cần ra bản app mới.

const ON = ["1", "true", "on", "yes"];

function flag(value) {
  return ON.includes(String(value ?? "").trim().toLowerCase());
}

/** Số nguyên ≥ 0; trống / sai / âm → mặc định. */
function count(value, fallback) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : fallback;
}

/** Khối `ads` gửi app qua GET /api/app-config (công khai). */
export function adsAppConfig(env = process.env) {
  return {
    enabled: flag(env.ADS_ENABLED),
    app_open_per_day: count(env.ADS_APP_OPEN_PER_DAY, 1),
  };
}

/** Nội dung /app-ads.txt (AdMob đối chiếu nhà phát triển); thiếu / sai env → null (404). */
export function appAdsTxt(env = process.env) {
  const id = String(env.ADMOB_PUBLISHER_ID ?? "").trim();
  if (!/^pub-\d{1,20}$/.test(id)) return null;
  return `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`;
}
