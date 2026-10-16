// Trang /admin của chủ dự án (spec 2026-10-16-admin-stats-design.md §6): mật khẩu
// HTTP Basic (ADMIN_DASHBOARD_PASSWORD). Server chưa đặt / đặt quá ngắn → khoá hẳn.
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s) => createHash("sha256").update(s).digest();

export function checkBasicAuth(header, password) {
  if (!password || password.length < 12) return false;
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  let decoded;
  try { decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8"); } catch { return false; }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  // So sánh băm cố định độ dài → không lộ độ dài / nội dung qua thời gian phản hồi
  return timingSafeEqual(digest(decoded.slice(i + 1)), digest(password));
}
