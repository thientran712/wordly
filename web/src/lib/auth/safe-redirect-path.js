/**
 * Chỉ cho redirect nội bộ sau OAuth callback — chặn open redirect qua param
 * `next` (ví dụ `next=@evil.com`, `next=//evil.com`, `next=https://evil.com`).
 */
export function safeRedirectPath(next) {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
