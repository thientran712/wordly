import test from "node:test";
import assert from "node:assert/strict";
import { isSlotDueNow } from "../../src/lib/email/cron-schedule.js";

// now cố định: 2026-10-10T03:00:00Z = 10:00 sáng giờ Asia/Ho_Chi_Minh (UTC+7),
// thứ Bảy (2026-10-10 là thứ Bảy).
const NOW = new Date("2026-10-10T03:00:00.000Z");

test("isSlotDueNow: đúng trong cửa sổ (sendTime vừa qua, trong window)", () => {
  const due = isSlotDueNow({
    sendTime: "09:58", timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, true);
});

test("isSlotDueNow: chưa tới giờ gửi — chưa due", () => {
  const due = isSlotDueNow({
    sendTime: "10:30", timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, false);
});

test("isSlotDueNow: đã qua cửa sổ (trễ hơn windowMinutes) — không due nữa", () => {
  const due = isSlotDueNow({
    sendTime: "09:00", timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, false);
});

test("isSlotDueNow: đúng giờ gửi (sendTime == now) — due", () => {
  const due = isSlotDueNow({
    sendTime: "10:00", timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, true);
});

test("isSlotDueNow: frequency weekdays, hôm nay thứ Bảy — không due dù đúng giờ", () => {
  const due = isSlotDueNow({
    sendTime: "10:00", timezone: "Asia/Ho_Chi_Minh", frequency: "weekdays",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, false);
});

test("isSlotDueNow: frequency custom, hôm nay (Sat=6) có trong customDays — due", () => {
  const due = isSlotDueNow({
    sendTime: "10:00", timezone: "Asia/Ho_Chi_Minh", frequency: "custom",
    customDays: [6], now: NOW, windowMinutes: 10,
  });
  assert.equal(due, true);
});

test("isSlotDueNow: frequency custom, hôm nay KHÔNG trong customDays — không due", () => {
  const due = isSlotDueNow({
    sendTime: "10:00", timezone: "Asia/Ho_Chi_Minh", frequency: "custom",
    customDays: [1, 2, 3], now: NOW, windowMinutes: 10,
  });
  assert.equal(due, false);
});

test("isSlotDueNow: thiếu sendTime — không due, không throw", () => {
  const due = isSlotDueNow({
    sendTime: null, timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, false);
});

test("isSlotDueNow: timezone khác (UTC) — đúng giờ UTC thì due, giờ VN thì không", () => {
  // now = 03:00 UTC. Với timezone UTC, sendTime 03:00 phải due.
  const dueUTC = isSlotDueNow({
    sendTime: "03:00", timezone: "UTC", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(dueUTC, true);

  // Cùng sendTime "03:00" nhưng theo giờ VN (UTC+7) thì là 20:00 UTC hôm trước —
  // cách xa NOW (03:00 UTC) hơn 10 phút nên không due.
  const dueVN = isSlotDueNow({
    sendTime: "03:00", timezone: "Asia/Ho_Chi_Minh", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(dueVN, false);
});

test("isSlotDueNow: timezone không hợp lệ — rơi về Asia/Ho_Chi_Minh, không throw", () => {
  const due = isSlotDueNow({
    sendTime: "10:00", timezone: "not-a-real-tz", frequency: "daily",
    customDays: null, now: NOW, windowMinutes: 10,
  });
  assert.equal(due, true);
});
