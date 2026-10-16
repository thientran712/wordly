// Link xem thống kê trong email của chủ dự án (spec 2026-10-16-admin-stats-design.md):
// "<hạn unix>.<HMAC-SHA256(khoá, hạn)>" — web đang tắt nên không có đăng nhập web;
// link có hạn 7 ngày, sửa hạn là sai chữ ký.
import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (secret, exp) => createHmac("sha256", secret).update(`wordly-stats:${exp}`).digest("base64url");

export function signStatsToken({ secret, now = new Date(), days = 7 }) {
  const exp = Math.floor(now.getTime() / 1000) + days * 86400;
  return `${exp}.${sign(secret, exp)}`;
}

export function verifyStatsToken(token, { secret, now = new Date() }) {
  if (!secret || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !parts[1]) return false;
  const exp = Number(parts[0]);
  if (exp * 1000 < now.getTime()) return false;
  const expected = Buffer.from(sign(secret, exp));
  const given = Buffer.from(parts[1]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
