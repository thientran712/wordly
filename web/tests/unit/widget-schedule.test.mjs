import test from "node:test";
import assert from "node:assert/strict";
import { validateScheduleBody, MAX_SCHEDULE_ENTRIES } from "../../src/lib/widget/schedule.js";

const now = new Date("2026-10-16T10:00:00Z");
const H = 60 * 60 * 1000;
const at = (h) => new Date(now.getTime() + h * H).toISOString();
const E = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("hợp lệ: id từ đã lưu → entry_id, bank-<uuid> → bank_word_id", () => {
  const v = validateScheduleBody({ entries: [{ shown_at: at(0), id: E }, { shown_at: at(1), id: `bank-${B}` }] }, now);
  assert.deepEqual(v, { ok: true, value: [
    { shown_at: at(0), entry_id: E, bank_word_id: null },
    { shown_at: at(1), entry_id: null, bank_word_id: B },
  ], dropped: 0 });
});

test("entries rỗng = chưa có widget nào → hợp lệ, chỉ xoá lịch tương lai", () => {
  assert.deepEqual(validateScheduleBody({ entries: [] }, now), { ok: true, value: [], dropped: 0 });
});

// Lùi 2 giờ 5 phút: app gửi giờ BẮT ĐẦU slot đang hiện (slot dài nhất 2 giờ).
test("biên giờ: [now−2h05, now+49h] nhận, ngoài khung bị bỏ (lệch đồng hồ máy không làm mất cả lịch)", () => {
  const v = validateScheduleBody({ entries: [
    { shown_at: at(-125 / 60), id: E }, { shown_at: at(49), id: E },
    { shown_at: at(-2.1), id: E }, { shown_at: at(49.01), id: E },
  ] }, now);
  assert.equal(v.ok, true);
  assert.deepEqual(v.value.map((r) => r.shown_at), [at(-125 / 60), at(49)]);
  assert.equal(v.dropped, 2);
});

test("id lạ / giờ không đọc được / dòng trùng → bỏ dòng đó, giữ phần còn lại", () => {
  const v = validateScheduleBody({ entries: [
    { shown_at: at(1), id: "not-a-uuid" }, { shown_at: "hôm qua", id: E }, { shown_at: 12345, id: E },
    null, { shown_at: at(2), id: E }, { shown_at: at(2), id: E },
  ] }, now);
  assert.equal(v.ok, true);
  assert.equal(v.value.length, 1);
  assert.equal(v.dropped, 5);
});

test("giờ trả về dạng ISO UTC chuẩn dù app gửi kèm múi giờ", () => {
  const v = validateScheduleBody({ entries: [{ shown_at: "2026-10-16T17:30:00+07:00", id: E }] }, now);
  assert.equal(v.value[0].shown_at, "2026-10-16T10:30:00.000Z");
});

test("sai hình dạng body hoặc quá 200 dòng → lỗi", () => {
  for (const bad of [null, {}, { entries: "x" }, { entries: {} }]) {
    assert.equal(validateScheduleBody(bad, now).ok, false, JSON.stringify(bad));
  }
  const many = Array.from({ length: MAX_SCHEDULE_ENTRIES + 1 }, (_, i) => ({ shown_at: at(i / 10), id: E }));
  assert.equal(validateScheduleBody({ entries: many }, now).ok, false);
  assert.equal(validateScheduleBody({ entries: many.slice(0, MAX_SCHEDULE_ENTRIES) }, now).ok, true);
});
