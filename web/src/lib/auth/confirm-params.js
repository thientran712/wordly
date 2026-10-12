import { safeRedirectPath } from "./safe-redirect-path.js";

// Loại link email mà GoTrue cho phép verifyOtp bằng token_hash.
const OTP_TYPES = new Set(["recovery", "signup", "email", "email_change", "invite", "magiclink"]);

/** Tham số của link email `/auth/confirm?token_hash=…&type=…&next=…`; null nếu không hợp lệ. */
export function parseConfirmParams(searchParams) {
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (!tokenHash || !OTP_TYPES.has(type)) return null;
  return { tokenHash, type, next: safeRedirectPath(searchParams.get("next")) };
}
