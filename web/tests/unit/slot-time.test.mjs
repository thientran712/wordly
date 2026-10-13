import test from "node:test";
import assert from "node:assert/strict";
import { HALF_HOUR_TIMES, normalizeTime, isHalfHour, checkSlotTime, HALF_HOUR_ERROR } from "../../src/lib/reminders/slot-time.js";

test("48 mốc từ 00:00 tới 23:30, cách nhau 30 phút", () => {
  assert.equal(HALF_HOUR_TIMES.length, 48);
  assert.equal(HALF_HOUR_TIMES[0], "00:00");
  assert.equal(HALF_HOUR_TIMES[1], "00:30");
  assert.equal(HALF_HOUR_TIMES[47], "23:30");
});

test("normalizeTime nhận HH:MM, H:MM, HH:MM:00 (Postgres) — sai thì null", () => {
  assert.equal(normalizeTime("8:30"), "08:30");
  assert.equal(normalizeTime("08:30:00"), "08:30");
  assert.equal(normalizeTime("24:00"), null);
  assert.equal(normalizeTime("08:60"), null);
  assert.equal(normalizeTime("08:30:15"), null);
  assert.equal(normalizeTime("abc"), null);
  assert.equal(normalizeTime(null), null);
});

test("isHalfHour chỉ đúng với :00 và :30", () => {
  for (const t of ["00:00", "08:30", "23:30", "8:00", "20:00:00"]) assert.equal(isHalfHour(t), true, t);
  for (const t of ["08:15", "08:10", "08:01", "8:5", "24:00", ""]) assert.equal(isHalfHour(t), false, t);
});

test("checkSlotTime: giờ lẻ → lỗi mốc 30 phút", () => {
  assert.deepEqual(checkSlotTime("08:15", []), { ok: false, error: HALF_HOUR_ERROR });
});

test("checkSlotTime: trùng khung khác (kể cả dạng HH:MM:SS) → lỗi trùng", () => {
  assert.deepEqual(checkSlotTime("08:30", ["08:30:00", "20:00:00"]), { ok: false, error: "Đã có khung giờ 08:30" });
});

test("checkSlotTime: hợp lệ → trả giờ đã chuẩn hoá", () => {
  assert.deepEqual(checkSlotTime("9:00", ["08:30:00", "08:15:00"]), { ok: true, time: "09:00" });
});
