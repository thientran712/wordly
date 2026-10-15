import test from "node:test";
import assert from "node:assert/strict";
import { selectPushWord } from "../../src/lib/push/select-push-word.js";
import { validateScheduleBody } from "../../src/lib/widget/schedule.js";

// Sửa sau review 15/10 (spec 2026-10-15-shared-word-source-design.md §4):
// lịch sử push phải lấy MỚI NHẤT (PostgREST cắt 1000 dòng), từ đã lưu lấy đúng
// 200 từ mới nhất như widget, lỗi truy vấn thì bỏ lượt chứ không gửi nhầm từ kho.

function fakeDb(tables, errors = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, order: null, limit: null };
      calls.push(call);
      const q = {
        select: () => q, eq: () => q, is: () => q, gte: () => q, in: () => q,
        order(col, opts) { call.order = [col, opts?.ascending]; return q; },
        limit(n) { call.limit = n; return q; },
        maybeSingle: () => q,
        then(resolve) {
          const error = errors[table] ?? null;
          return Promise.resolve({ data: error ? null : (tables[table] ?? []), error }).then(resolve);
        },
      };
      return q;
    },
  };
}

const now = new Date("2026-10-16T13:00:00Z");
const savedRow = { id: "11111111-1111-1111-1111-111111111111", source_text: "resilient", translated_text: "kiên cường", saved_at: "2026-10-10T00:00:00Z" };

test("lịch sử push: mới nhất trước, có giới hạn — không để PostgREST trả 1000 dòng cũ nhất", async () => {
  const db = fakeDb({ translate_history: [savedRow], word_source_settings: null });
  await selectPushWord(db, "u1", now, { selectBank: async () => [] });
  const log = db.calls.find((c) => c.table === "suggestion_log");
  assert.deepEqual(log.order, ["shown_at", false]);
  assert.ok(log.limit > 0 && log.limit <= 1000);
});

test("từ đã lưu: 200 từ mới nhất — cùng tập với widget trên app", async () => {
  const db = fakeDb({ translate_history: [savedRow], word_source_settings: null });
  await selectPushWord(db, "u1", now, { selectBank: async () => [] });
  const saved = db.calls.find((c) => c.table === "translate_history");
  assert.deepEqual(saved.order, ["saved_at", false]);
  assert.equal(saved.limit, 200);
});

test("lỗi đọc từ đã lưu hoặc lịch sử push → bỏ lượt (null), không gửi nhầm từ kho", async () => {
  const bank = async () => [{ id: "b1", word: "diligent", meaning_vi: "chăm chỉ" }];
  for (const table of ["translate_history", "suggestion_log"]) {
    const db = fakeDb({ translate_history: [savedRow], word_source_settings: null }, { [table]: { message: "timeout" } });
    assert.equal(await selectPushWord(db, "u1", now, { selectBank: bank }), null, table);
  }
});

test("lịch widget: nhận slot đang hiện bắt đầu tới 2 giờ trước (app gửi giờ bắt đầu slot)", () => {
  const ok = validateScheduleBody({ entries: [{ shown_at: new Date(now - 115 * 60_000).toISOString(), id: savedRow.id }] }, now);
  assert.equal(ok.value.length, 1);
  const old = validateScheduleBody({ entries: [{ shown_at: new Date(now - 3 * 3_600_000).toISOString(), id: savedRow.id }] }, now);
  assert.equal(old.value.length, 0);
});
