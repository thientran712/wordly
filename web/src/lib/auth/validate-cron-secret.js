import { timingSafeEqual } from "crypto";

export function validateCronSecret(authHeader) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}
