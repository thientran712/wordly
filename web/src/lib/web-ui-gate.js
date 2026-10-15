// Tắt giao diện web (chủ dự án 13/10/2026): Wordly giờ chỉ dùng trên iPhone.
// CHỈ TẮT — code trang web giữ nguyên; bật lại bằng WEB_UI_ENABLED=1 trên VPS.
// Khi tắt vẫn chạy: API (backend app iOS + cron), trang app/App Store mở
// (/privacy, /support, /terms), link trong email Auth (/auth/*, /reset-password) và mẫu
// email GoTrue tải về (/email-templates/*). Trang khác → MOBILE_ONLY_PATH.

export const MOBILE_ONLY_PATH = "/mobile-only";

const EXACT = new Set(["/privacy", "/support", "/terms", "/reset-password", MOBILE_ONLY_PATH]);
const PREFIXES = ["/api/", "/auth/", "/email-templates/"];

export function isWebUiEnabled(env = process.env) {
  return env.WEB_UI_ENABLED === "1" || env.WEB_UI_ENABLED === "true";
}

/** "allow" = đi tiếp như bình thường; "mobile-only" = trả trang "có trên iPhone". */
export function webUiGate(path, enabled) {
  if (enabled) return "allow";
  if (EXACT.has(path) || PREFIXES.some((p) => path.startsWith(p))) return "allow";
  return "mobile-only";
}
