// Đọc map { org_id: role } từ kết quả supabase.auth.getClaims() — logic thuần,
// KHÔNG import gì (org-context.js import next/headers nên không test được).
//
// Claim `user_orgs` do custom access token hook nhúng vào JWT. Hook chưa cấu
// hình hoặc claim sai kiểu → {} (mọi guard chặn hết, đúng hướng an toàn).
export function userOrgsFromClaims(result) {
  if (!result || result.error) return {};
  const orgs = result.data?.claims?.user_orgs;
  if (!orgs || typeof orgs !== "object" || Array.isArray(orgs)) return {};
  return orgs;
}
