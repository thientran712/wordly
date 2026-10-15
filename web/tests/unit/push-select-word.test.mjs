import test from "node:test";
import assert from "node:assert/strict";
import { pickPushWord, lastShownMap } from "../../src/lib/push/select-push-word.js";

// Push chọn từ đã lưu để nhắc. Lỗi cũ (15/10/2026): push không đổi lịch ôn của
// từ → lần nào cũng lấy lại nhóm từ lưu sớm nhất (20 từ, 2 khung/ngày → chỉ 6
// từ xoay vòng). Giờ: từ CHƯA từng nhắc trước, rồi tới từ nhắc LÂU NHẤT.
const day = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-01T00:00:00Z").getTime();
const rows = (n) => Array.from({ length: n }, (_, i) => ({
  id: `w${i + 1}`, state: "new", due_at: null, saved_at: new Date(t0 + i * 60_000).toISOString(),
}));

test("20 từ, 2 khung/ngày trong 14 ngày → nhắc đủ 20 từ trước khi lặp", () => {
  const words = rows(20);
  const shown = new Map();
  const sent = [];
  for (let k = 0; k < 28; k++) {
    const now = t0 + 10 * day + k * day / 2;
    const w = pickPushWord(words, shown);
    sent.push(w.id);
    shown.set(w.id, now);
  }
  assert.equal(new Set(sent.slice(0, 20)).size, 20, "20 lần đầu là 20 từ khác nhau");
  assert.deepEqual(sent.slice(20), sent.slice(0, 8), "vòng sau bắt đầu lại từ từ nhắc lâu nhất");
});

test("ưu tiên từ chưa từng nhắc, rồi từ nhắc lâu nhất", () => {
  const words = rows(3);
  const shown = new Map([["w1", t0 + 5 * day], ["w2", t0 + 2 * day]]);
  assert.equal(pickPushWord(words, shown).id, "w3");
  shown.set("w3", t0 + 6 * day);
  assert.equal(pickPushWord(words, shown).id, "w2");
});

test("cùng chưa nhắc: từ quá hạn ôn trước (hạn sớm nhất), rồi từ mới theo thứ tự lưu", () => {
  const words = [
    { id: "new1", state: "new", due_at: null, saved_at: "2026-09-01T00:00:00Z" },
    { id: "due2", state: "review", due_at: "2026-10-05T00:00:00Z", saved_at: "2026-09-10T00:00:00Z" },
    { id: "due1", state: "review", due_at: "2026-10-02T00:00:00Z", saved_at: "2026-09-20T00:00:00Z" },
  ];
  assert.equal(pickPushWord(words, new Map()).id, "due1");
  assert.equal(pickPushWord(words, new Map([["due1", t0]])).id, "due2");
  assert.equal(pickPushWord(words, new Map([["due1", t0], ["due2", t0]])).id, "new1");
});

test("một từ duy nhất vẫn được nhắc; không có từ → null", () => {
  assert.equal(pickPushWord(rows(1), new Map([["w1", t0]])).id, "w1");
  assert.equal(pickPushWord([], new Map()), null);
});

test("lastShownMap: lấy lần hiện gần nhất mỗi từ (push + widget), bỏ dòng không có id", () => {
  const m = lastShownMap([
    { entry_id: "a", shown_at: "2026-10-01T00:00:00Z" },
    { entry_id: "a", shown_at: "2026-10-03T00:00:00Z" },
    { entry_id: "b", shown_at: "2026-10-02T00:00:00Z" },
    { entry_id: null, bank_word_id: 9, shown_at: "2026-10-02T00:00:00Z" },
  ], "entry_id");
  assert.equal(m.get("a"), Date.parse("2026-10-03T00:00:00Z"));
  assert.equal(m.get("b"), Date.parse("2026-10-02T00:00:00Z"));
  assert.equal(m.size, 2);
});
