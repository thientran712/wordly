// Validate body các route /api/push/* (ranh giới tin cậy với app).
export const DEFAULT_PUSH_TIME = "20:00";
export const MAX_PUSH_SLOTS = 10;
const TOKEN_RE = /^[A-Za-z0-9:_-]{100,4096}$/;
const FREQUENCIES = ["daily", "weekdays", "custom"];

export function validateDeviceBody(body) {
  const { token, platform = "ios", app_version = null } = body || {};
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, error: "Token không hợp lệ" };
  if (!["ios", "android"].includes(platform)) return { ok: false, error: "platform không hợp lệ" };
  if (app_version !== null && (typeof app_version !== "string" || app_version.length > 32)) {
    return { ok: false, error: "app_version không hợp lệ" };
  }
  return { ok: true, value: { token, platform, app_version } };
}

export function validatePreferencesBody(body) {
  const { enabled, frequency, custom_days } = body || {};
  if (typeof enabled !== "boolean") return { ok: false, error: "enabled phải là true/false" };
  if (!FREQUENCIES.includes(frequency)) return { ok: false, error: "frequency không hợp lệ" };
  if (!Array.isArray(custom_days) || custom_days.length === 0 || custom_days.length > 7
      || !custom_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { ok: false, error: "custom_days không hợp lệ" };
  }
  return { ok: true, value: { enabled, frequency, custom_days: [...new Set(custom_days)].sort((a, b) => a - b) } };
}
