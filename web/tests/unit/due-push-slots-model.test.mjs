import test from "node:test";
import assert from "node:assert/strict";
import { duePushSlotsModel } from "../../src/lib/push/due-push-slots-model.js";

const base = (over = {}) => ({
  slots: [{ id: "s1", user_id: "u1", send_time: "20:00:00", enabled: true }],
  preferences: [{ user_id: "u1", enabled: true, frequency: "daily", custom_days: [1, 2, 3, 4, 5] }],
  profiles: [{ id: "u1", timezone: "Asia/Ho_Chi_Minh" }],
  devices: [{ user_id: "u1" }],
  logs: [],
  ...over,
});
// 13:00Z = 20:00 VN (UTC+7). 13/10/2026 là thứ Ba.
const at = (iso) => new Date(iso);

test("đúng giờ → tới hạn, send_date theo giờ địa phương", () => {
  assert.deepEqual(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:00:00Z") }),
    [{ slot_id: "s1", user_id: "u1", send_date: "2026-10-13" }]);
});

test("trễ 29 phút vẫn gửi bù; 30 phút thì thôi; sớm 1 phút chưa gửi", () => {
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:29:00Z") }).length, 1);
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:30:00Z") }).length, 0);
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T12:59:00Z") }).length, 0);
});

// Với mốc :00/:30 + cửa sổ 30 phút, gửi bù không vắt qua nửa đêm (23:30 hết
// hạn đúng 00:00) — hai ca dưới dùng cửa sổ 60 phút để giữ nhánh "hôm qua" đúng
// nếu sau này nới cửa sổ.
test("23:30 + cron 00:05 hôm sau (cửa sổ 60) → gửi bù, send_date = hôm qua (Review Focus #3)", () => {
  const d = base({ slots: [{ id: "s1", user_id: "u1", send_time: "23:30:00", enabled: true }] });
  // 17:05Z 13/10 = 00:05 VN 14/10
  assert.deepEqual(duePushSlotsModel({ ...d, now: at("2026-10-13T17:05:00Z"), catchupMinutes: 60 }),
    [{ slot_id: "s1", user_id: "u1", send_date: "2026-10-13" }]);
});

test("23:30 hết hạn đúng 00:00 với cửa sổ 30 (không gửi bù qua nửa đêm)", () => {
  const d = base({ slots: [{ id: "s1", user_id: "u1", send_time: "23:30:00", enabled: true }] });
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-13T16:59:00Z") }).length, 1);
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-13T17:00:00Z") }).length, 0);
});

test("qua nửa đêm (cửa sổ 60) xét thứ của HÔM QUA: hẹn 23:30 thứ Sáu, weekdays, cron 00:05 thứ Bảy → vẫn gửi", () => {
  const d = base({
    slots: [{ id: "s1", user_id: "u1", send_time: "23:30:00", enabled: true }],
    preferences: [{ user_id: "u1", enabled: true, frequency: "weekdays", custom_days: [] }],
  });
  // 16/10/2026 thứ Sáu; 17:05Z 16/10 = 00:05 VN thứ Bảy 17/10
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-16T17:05:00Z"), catchupMinutes: 60 })[0]?.send_date, "2026-10-16");
});

test("đã có push_log cùng (slot, ngày) → bỏ", () => {
  const d = base({ logs: [{ slot_id: "s1", send_date: "2026-10-13" }] });
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-13T13:05:00Z") }).length, 0);
});

test("không có thiết bị / tắt push / tắt slot → bỏ", () => {
  const now = at("2026-10-13T13:00:00Z");
  assert.equal(duePushSlotsModel({ ...base({ devices: [] }), now }).length, 0);
  assert.equal(duePushSlotsModel({ ...base({ preferences: [{ user_id: "u1", enabled: false, frequency: "daily", custom_days: [] }] }), now }).length, 0);
  assert.equal(duePushSlotsModel({ ...base({ slots: [{ id: "s1", user_id: "u1", send_time: "20:00:00", enabled: false }] }), now }).length, 0);
});

test("custom_days: 0=CN … 6=T7", () => {
  const d = (days) => base({ preferences: [{ user_id: "u1", enabled: true, frequency: "custom", custom_days: days }] });
  const now = at("2026-10-13T13:00:00Z"); // thứ Ba = 2
  assert.equal(duePushSlotsModel({ ...d([2]), now }).length, 1);
  assert.equal(duePushSlotsModel({ ...d([1, 3]), now }).length, 0);
});

test("múi giờ khác: Kolkata (+5:30), New York (đổi giờ mùa hè), sai/null → VN", () => {
  const tz = (timezone) => base({ profiles: [{ id: "u1", timezone }] });
  // 14:30Z = 20:00 Kolkata
  assert.equal(duePushSlotsModel({ ...tz("Asia/Kolkata"), now: at("2026-10-13T14:30:00Z") }).length, 1);
  // 13/10 New York đang EDT (UTC-4): 20:00 = 00:00Z 14/10
  assert.deepEqual(duePushSlotsModel({ ...tz("America/New_York"), now: at("2026-10-14T00:00:00Z") })[0]?.send_date, "2026-10-13");
  assert.equal(duePushSlotsModel({ ...tz("Mars/Olympus"), now: at("2026-10-13T13:00:00Z") }).length, 1);
  assert.equal(duePushSlotsModel({ ...tz(null), now: at("2026-10-13T13:00:00Z") }).length, 1);
});

// Wordly Pro (spec 2026-10-16 §3): BILLING_ENFORCE bật → người miễn phí chỉ
// nhận khung ĐANG BẬT sớm nhất trong ngày; Pro (kể cả đang ân hạn) nhận đủ.
test("freeOneSlot: miễn phí chỉ khung bật sớm nhất, Pro gửi đủ", () => {
  const d = base({
    slots: [
      { id: "s0", user_id: "u1", send_time: "07:00:00", enabled: false },
      { id: "s1", user_id: "u1", send_time: "08:00:00", enabled: true },
      { id: "s2", user_id: "u1", send_time: "20:00:00", enabled: true },
    ],
  });
  const now20 = at("2026-10-13T13:05:00Z");
  const now08 = at("2026-10-13T01:05:00Z");
  assert.equal(duePushSlotsModel({ ...d, now: now20 }).length, 1, "mặc định như cũ");
  assert.equal(duePushSlotsModel({ ...d, now: now20, freeOneSlot: true, entitlements: [] }).length, 0);
  assert.equal(duePushSlotsModel({ ...d, now: now08, freeOneSlot: true, entitlements: [] }).length, 1);
  const pro = [{ user_id: "u1", source: "app_store", expires_at: "2026-11-01T00:00:00Z" }];
  assert.equal(duePushSlotsModel({ ...d, now: now20, freeOneSlot: true, entitlements: pro }).length, 1);
  const grace = [{ user_id: "u1", source: "app_store", expires_at: "2026-10-01T00:00:00Z", in_grace: true, grace_expires_at: "2026-10-20T00:00:00Z" }];
  assert.equal(duePushSlotsModel({ ...d, now: now20, freeOneSlot: true, entitlements: grace }).length, 1);
});
