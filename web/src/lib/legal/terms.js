// Đồng ý Điều khoản sử dụng + Chính sách quyền riêng tư (spec
// 2026-10-15-terms-consent-design.md). Đổi nội dung /terms hoặc /privacy theo
// cách người dùng cần biết → tăng CURRENT_TERMS_VERSION: app hỏi lại một lần.

export const CURRENT_TERMS_VERSION = 1;

/** Body của POST /api/consent → { version } hoặc { error: "invalid" | "outdated" }. */
export function parseConsentBody(body, current = CURRENT_TERMS_VERSION) {
  const v = body && typeof body === "object" ? body.version : undefined;
  if (!Number.isInteger(v) || v < 1 || v > current) return { error: "invalid" };
  // App đang hiện chữ cũ → phải tải lại điều khoản mới rồi mới đồng ý
  if (v < current) return { error: "outdated" };
  return { version: v };
}

/** Hồ sơ chưa đồng ý phiên bản hiện tại. */
export function needsConsent(profile) {
  return !(profile?.terms_version >= CURRENT_TERMS_VERSION);
}
