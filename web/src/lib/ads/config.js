// Cấu hình quảng cáo từ env (spec 2026-10-23-in-app-ads-design.md).
// ADS_ENFORCE mặc định TẮT: deploy server trước, bật khi bản app có quảng cáo
// lên store — app cũ không xem quảng cáo được nên không bị chặn lượt dịch.

const ON = ["1", "true", "on", "yes"];
const OFF = ["0", "false", "off", "no"];

function flag(value, fallback) {
  const s = String(value ?? "").trim().toLowerCase();
  if (ON.includes(s)) return true;
  if (OFF.includes(s)) return false;
  return fallback;
}

/** Số nguyên ≥ 0; trống / sai / âm → mặc định. */
function count(value, fallback) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : fallback;
}

/** Luật lượt dịch phía server. */
export function adsConfig(env = process.env) {
  return {
    enforced: flag(env.ADS_ENFORCE, false),
    dailyFree: count(env.ADS_DAILY_FREE, 10),
    rewardCredits: count(env.ADS_REWARD_CREDITS, 10) || 10,
    minBuild: count(env.ADS_MIN_BUILD, 0),
  };
}

/** Chỉ bản app có quảng cáo (build ≥ ADS_MIN_BUILD) bị tính lượt dịch. */
export function adsApplyToBuild(buildHeader, minBuild) {
  const s = String(buildHeader ?? "").trim();
  if (!(minBuild > 0) || !/^\d+$/.test(s)) return false;
  return Number(s) >= minBuild;
}

/** Cấu hình hiển thị quảng cáo gửi app qua GET /api/app-config (công khai). */
export function adsAppConfig(env = process.env) {
  return {
    enabled: flag(env.ADS_ENABLED, false),
    app_open_per_day: count(env.ADS_APP_OPEN_PER_DAY, 2),
    interstitial_min_gap_sec: count(env.ADS_INTERSTITIAL_GAP_SEC, 180),
    interstitial_per_day: count(env.ADS_INTERSTITIAL_PER_DAY, 6),
    banner: flag(env.ADS_BANNER, true),
    grace_hours: count(env.ADS_GRACE_HOURS, 0),
    premium_theme_ids: String(env.ADS_PREMIUM_THEMES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
