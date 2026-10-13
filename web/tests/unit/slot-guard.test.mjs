import test from "node:test";
import assert from "node:assert/strict";
import { guardSlotTime } from "../../src/lib/reminders/slot-guard.js";

function fakeSupabase(rows, { error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      let data = rows;
      const q = {
        select: () => q,
        eq(col, val) { calls.push(["eq", col, val]); data = data.filter(r => r[col] === val); return q; },
        then: (resolve) => Promise.resolve({ data: error ? null : data, error }).then(resolve),
      };
      return q;
    },
  };
}

const rows = [
  { id: "s1", user_id: "u1", send_time: "08:15:00" }, // giờ lẻ cũ
  { id: "s2", user_id: "u1", send_time: "20:00:00" },
  { id: "x9", user_id: "u2", send_time: "09:00:00" }, // người khác — không tính
];

test("đúng bảng + lọc theo user", async () => {
  const sb = fakeSupabase(rows);
  await guardSlotTime(sb, { table: "push_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(sb.calls.slice(0, 2), [["from", "push_slots"], ["eq", "user_id", "u1"]]);
});

test("giờ của người khác không tính là trùng", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(r, { ok: true, time: "09:00" });
});

test("trùng khung khác của chính mình → 400", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "20:00" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.error, "Đã có khung giờ 20:00");
});

test("PUT lại đúng giờ của chính khung đó → hợp lệ (excludeId)", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "20:00", excludeId: "s2" });
  assert.deepEqual(r, { ok: true, time: "20:00" });
});

test("giờ lẻ → 400 lỗi mốc", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "08:45" });
  assert.equal(r.status, 400);
  assert.match(r.error, /giờ tròn hoặc rưỡi/);
});

test("DB lỗi → 500, không cho qua", async () => {
  const r = await guardSlotTime(fakeSupabase([], { error: { message: "boom" } }), { table: "email_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(r, { ok: false, status: 500, error: "boom" });
});
