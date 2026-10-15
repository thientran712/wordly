import test from "node:test";
import assert from "node:assert/strict";
import { planPushWord, lastShownMap } from "../../src/lib/push/select-push-word.js";

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
  const pushLog = [];
  const sent = [];
  for (let k = 0; k < 28; k++) {
    const now = new Date(t0 + 10 * day + k * day / 2);
    const [p] = planPushWord({ now, personal: words, pinnedIds: [], usesBank: false, schedule: [], pushLog });
    sent.push(p.id);
    pushLog.push({ entry_id: p.id, shown_at: now.toISOString() });
  }
  assert.equal(new Set(sent.slice(0, 20)).size, 20, "20 lần đầu là 20 từ khác nhau");
  assert.deepEqual(sent.slice(20), sent.slice(0, 8), "vòng sau bắt đầu lại từ từ nhắc lâu nhất");
});

test("ưu tiên từ chưa từng nhắc, rồi từ nhắc lâu nhất", () => {
  const words = rows(3);
  const now = new Date(t0 + 7 * day);
  const at = (d) => new Date(t0 + d * day).toISOString();
  const plan = (pushLog) => planPushWord({ now, personal: words, pinnedIds: [], usesBank: false, schedule: [], pushLog })[0].id;
  assert.equal(plan([{ entry_id: "w1", shown_at: at(5) }, { entry_id: "w2", shown_at: at(2) }]), "w3");
  assert.equal(plan([{ entry_id: "w1", shown_at: at(5) }, { entry_id: "w2", shown_at: at(2) }, { entry_id: "w3", shown_at: at(6) }]), "w2");
});

test("lưu từ mới (app cũ log widget cả pool) không làm push quay về từ cũ nhất — chỉ lịch sử push xếp thứ tự", () => {
  // Bản cũ đọc cả log widget; nay planPushWord chỉ nhận pushLog (source = push)
  const words = rows(3);
  const now = new Date(t0 + 7 * day);
  const pushLog = [{ entry_id: "w1", shown_at: new Date(t0 + day).toISOString() }];
  assert.equal(planPushWord({ now, personal: words, pinnedIds: [], usesBank: false, schedule: [], pushLog })[0].id, "w2");
});

test("một từ duy nhất vẫn được nhắc", () => {
  const now = new Date(t0 + day);
  const [p] = planPushWord({ now, personal: rows(1), pinnedIds: [], usesBank: false, schedule: [], pushLog: [{ entry_id: "w1", shown_at: new Date(t0).toISOString() }] });
  assert.equal(p.id, "w1");
});

test("lastShownMap: lấy lần hiện gần nhất mỗi từ, bỏ dòng không có id", () => {
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
