import test from "node:test";
import assert from "node:assert/strict";
import { planPushWord, selectPushWord } from "../../src/lib/push/select-push-word.js";

// Luật chọn từ cho push theo spec 2026-10-15 §4 — `now` cố định, từng bước.
const now = new Date("2026-10-16T13:00:00Z"); // 20:00 giờ VN
const H = 60 * 60 * 1000;
const ago = (h) => new Date(now.getTime() - h * H).toISOString();
const words = (...ids) => ids.map((id) => ({ id, word: id }));
const sched = (h, id) => (String(id).startsWith("bank-") ? { shown_at: ago(h), bank_word_id: id.slice(5) } : { shown_at: ago(h), entry_id: id });
const push = (h, id) => ({ shown_at: ago(h), entry_id: id });
// Có lịch tương lai = app đang gửi lịch (đã thêm widget, mở app trong 48 giờ)
const future = (id = "zz") => sched(-3, id);

const plan = (o) => planPushWord({ now, personal: [], pinnedIds: [], usesBank: true, schedule: [], pushLog: [], ...o });

test("loại: từ đang trên widget / hiện trong 2 giờ qua / sắp hiện trong 5 phút", () => {
  const p = plan({ personal: words("a", "b", "c", "d"), schedule: [sched(0.5, "a"), sched(1.9, "b"), sched(-0.05, "c"), future()] });
  assert.deepEqual(p[0], { step: 2, id: "d" });
});

test("bước 1: từ widget hiện 6–48 giờ trước, chưa push lại từ lúc đó", () => {
  const p = plan({
    personal: words("a", "b", "c", "d"),
    schedule: [sched(5, "a"), sched(10, "b"), sched(30, "c"), sched(49, "d"), future()],
    pushLog: [push(8, "b")], // b đã push sau lần hiện → bỏ
  });
  assert.deepEqual(p[0], { step: 1, id: "c" }, "a mới hiện 5 giờ (chưa đủ 6), d quá 48 giờ");
});

test("bước 1: push TRƯỚC lần hiện thì vẫn chọn được (chưa push lại từ lúc đó)", () => {
  const p = plan({ personal: words("a"), schedule: [sched(10, "a"), future()], pushLog: [push(20, "a")] });
  assert.deepEqual(p[0], { step: 1, id: "a" });
});

test("bước 1: ưu tiên từ ghim, rồi từ lâu chưa push nhất", () => {
  const s = [sched(7, "a"), sched(8, "b"), sched(9, "c"), future()];
  assert.deepEqual(plan({ personal: words("a", "b", "c"), pinnedIds: ["b"], schedule: s })[0], { step: 1, id: "b" });
  assert.deepEqual(plan({ personal: words("a", "b", "c"), schedule: s, pushLog: [push(40, "a"), push(30, "b")] })[0], { step: 1, id: "c" });
});

test("bước 2: từ ghim chưa push trong 24 giờ trước, rồi từ lâu chưa push nhất", () => {
  const personal = words("a", "b", "p");
  assert.deepEqual(plan({ personal, pinnedIds: ["p"], pushLog: [push(30, "p")] })[0], { step: 2, id: "p" });
  // ghim vừa push 10 giờ trước → nhường cho từ chưa từng push
  assert.deepEqual(plan({ personal, pinnedIds: ["p"], pushLog: [push(10, "p"), push(50, "a")] })[0], { step: 2, id: "b" });
  // cùng chưa push → theo thứ tự lưu
  assert.deepEqual(plan({ personal })[0], { step: 2, id: "a" });
});

test("không có lịch widget (chưa thêm widget / app cũ / quá 48 giờ) → bỏ bước loại và bước 1", () => {
  // Chỉ có dòng đã qua, không có dòng tương lai
  const p = plan({ personal: words("a", "b"), schedule: [sched(1, "a"), sched(10, "b")], pushLog: [push(100, "a"), push(90, "b")] });
  assert.deepEqual(p[0], { step: 2, id: "a" }, "a không bị loại dù vừa hiện; b không được ưu tiên bước 1");
});

test("bước 3 → 4: mọi từ bị loại + bật kho → thử kho trước, kho lỗi thì dùng từ của bạn", () => {
  const p = plan({ personal: words("a", "b"), schedule: [sched(0.2, "a"), sched(1, "b"), sched(0.5, "bank-k1"), future()], pushLog: [push(100, "b")] });
  assert.deepEqual(p, [
    { step: 3, bank: true, avoidBankIds: ["k1"] },
    { step: 4, id: "a" },
  ]);
});

test("bước 4: mọi từ bị loại + tắt kho → từ của bạn, chấp nhận trùng widget", () => {
  const p = plan({ usesBank: false, personal: words("a"), schedule: [sched(0.2, "a"), future()] });
  assert.deepEqual(p, [{ step: 4, id: "a" }]);
});

test("bước 5: chưa có từ nào của bạn → kho (kể cả khi tắt trộn), tránh kho vừa push/đang hiện", () => {
  const p = plan({ usesBank: false, schedule: [sched(0.1, "bank-k2"), future()], pushLog: [{ shown_at: ago(30), bank_word_id: "k1" }] });
  assert.deepEqual(p, [{ step: 5, bank: true, avoidBankIds: ["k1", "k2"] }]);
});

test("nhiều khung giờ cùng ngày: lần gửi trước đã ghi log → lần sau chọn từ khác", () => {
  const personal = words("a", "b", "c");
  const log = [];
  const sent = [];
  for (const h of [8, 4, 0]) { // 12:00, 16:00, 20:00
    const at = new Date(now.getTime() - h * H);
    const [first] = planPushWord({ now: at, personal, pinnedIds: [], usesBank: false, schedule: [], pushLog: log });
    sent.push(first.id);
    log.push({ shown_at: at.toISOString(), entry_id: first.id });
  }
  assert.deepEqual(sent, ["a", "b", "c"]);
});

// ── selectPushWord: đọc DB + dựng pool + chọn ──────────────────────────────
function fakeDb(tables) {
  const calls = [];
  function from(table) {
    const filters = [];
    const q = {
      select: () => q, order: () => q, limit: () => q, gte: () => q,
      eq(c, v) { filters.push([c, v]); return q; },
      is(c, v) { filters.push([c, v]); return q; },
      maybeSingle() { q.single = true; return q; },
      then(resolve) {
        calls.push([table, filters]);
        const rows = (tables[table] || []).filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
        return Promise.resolve({ data: q.single ? rows[0] ?? null : rows, error: null }).then(resolve);
      },
    };
    return q;
  }
  return { from, calls };
}
const saved = (id, word, extra = {}) => ({ id, user_id: "u1", source_text: word, translated_text: `nghĩa ${word}`, ...extra });

test("selectPushWord: không có cài đặt → mặc định; trả từ của bạn kèm nghĩa", async () => {
  const sb = fakeDb({ translate_history: [saved("a", "resilient"), saved("x", "other", { user_id: "u2" })] });
  const w = await selectPushWord(sb, "u1", now, { selectBank: async () => [] });
  assert.deepEqual(w, { id: "a", word: "resilient", meaning: "nghĩa resilient", fromBank: false, step: 2 });
  assert.ok(sb.calls.find(([t, f]) => t === "suggestion_log" && f.some(([c, v]) => c === "source" && v === "push")), "chỉ lịch sử push");
});

test("selectPushWord: chỉ từ ghim → chỉ chọn trong từ ghim; ghim đã xoá hết → như tắt", async () => {
  const th = [saved("a", "alpha"), saved("b", "beta")];
  const s1 = fakeDb({ translate_history: th, word_source_settings: [{ user_id: "u1", include_saved: true, include_bank: true, pinned_ids: ["b"], pinned_only: true }] });
  assert.equal((await selectPushWord(s1, "u1", now, { selectBank: async () => [] })).id, "b");
  const s2 = fakeDb({ translate_history: th, word_source_settings: [{ user_id: "u1", include_saved: true, include_bank: true, pinned_ids: ["gone"], pinned_only: true }] });
  assert.equal((await selectPushWord(s2, "u1", now, { selectBank: async () => [] })).id, "a");
});

test("selectPushWord: chưa lưu từ nào → từ kho (bước 5), truyền id kho cần tránh", async () => {
  const sb = fakeDb({ suggestion_log: [{ user_id: "u1", source: "push", bank_word_id: "k1", shown_at: ago(5) }] });
  let recent = null;
  const w = await selectPushWord(sb, "u1", now, { selectBank: async (_s, _u, o) => { recent = o.recentIds; return [{ id: "k9", word: "go", meaning_vi: "đi" }]; } });
  assert.deepEqual(w, { id: "k9", word: "go", meaning: "đi", fromBank: true, step: 5 });
  assert.deepEqual(recent, ["k1"]);
});

test("selectPushWord: bước 3 kho lỗi/hết → rơi xuống bước 4; không có gì → null", async () => {
  const sb = fakeDb({
    translate_history: [saved("a", "alpha")],
    widget_schedule: [{ user_id: "u1", ...sched(0.5, "a") }, { user_id: "u1", ...future() }],
  });
  const w = await selectPushWord(sb, "u1", now, { selectBank: async () => { throw new Error("db"); } });
  assert.deepEqual([w.id, w.step], ["a", 4]);
  assert.equal(await selectPushWord(fakeDb({}), "u1", now, { selectBank: async () => [] }), null);
});

// Quiz trả lời sai → từ "đang ôn lại", hẹn ôn sau 1 ngày. Push ưu tiên từ đó
// khi sắp/đã đến hạn (trong 6 giờ tới) và chưa push lại kể từ lần sai.
test("bước 0: từ trả lời sai trong quiz, đến hạn ôn → gửi trước mọi bước khác", () => {
  const due = [{ id: "c", due_at: ago(-2) }]; // đến hạn sau 2 giờ nữa
  const p = plan({ personal: words("a", "b", "c"), schedule: [sched(10, "a"), future()], due });
  assert.deepEqual(p[0], { step: 0, id: "c" });
});

test("bước 0: chưa tới hạn (còn > 6 giờ) hoặc đã push sau lần sai → bỏ qua", () => {
  assert.notEqual(plan({ personal: words("a", "c"), due: [{ id: "c", due_at: ago(-10) }] })[0].step, 0);
  // sai lúc due-24h = 20 giờ trước; đã push 5 giờ trước → không gửi lại
  assert.notEqual(plan({ personal: words("a", "c"), due: [{ id: "c", due_at: ago(-4) }], pushLog: [push(5, "c")] })[0].step, 0);
});

test("bước 0: từ đến hạn đang trên widget thì không gửi trùng", () => {
  const p = plan({ personal: words("a", "c"), due: [{ id: "c", due_at: ago(1) }], schedule: [sched(0.5, "c"), future()] });
  assert.notEqual(p[0].id, "c");
});
