import test from "node:test";
import assert from "node:assert/strict";
import {
  TITLES, QUIZ, QUIZ_OWN, SHOW, LONG_QUIZ, LONG_SHOW, FORBIDDEN,
  firstMeaning, pushCopy, templateIndex,
} from "../../src/lib/push/copy.js";

// Bố cục v2 (chủ dự án duyệt 13/10/2026): bỏ «từ» = “nghĩa” — từ lồng vào câu
// chọc. Xen kẽ 2 kiểu theo ngày: Đố (giấu nghĩa, hỏi có nhớ không) và Khoe
// (nghĩa nằm trong câu: "{w} là {m}").
const emojiCount = (s) => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
const now = new Date("2026-10-13T13:00:00Z");
const days = (n) => Array.from({ length: n }, (_, d) => new Date(Date.UTC(2026, 9, 13 + d, 13)));
const fill = (t, w, m = "") => t.replaceAll("{w}", w).replaceAll("{m}", m);
const ALL_TEMPLATES = [...QUIZ, ...QUIZ_OWN, ...SHOW, ...LONG_QUIZ, ...LONG_SHOW];

test("đủ mẫu: ≥ 15 tiêu đề, ≥ 12 câu đố, ≥ 8 câu khoe", () => {
  assert.ok(TITLES.length >= 15);
  assert.ok(QUIZ.length >= 12);
  assert.ok(SHOW.length >= 8);
});

test("tiêu đề ≤ 16 ký tự — không bao giờ bị iOS cắt '…' trên màn hình khoá", () => {
  for (const t of TITLES) assert.ok(Array.from(t).length <= 16, `"${t}" dài ${Array.from(t).length}`);
});

test("mẫu: có {w}, câu khoe có {m}, câu đố không lộ {m}; ≤ 70 ký tự; không từ cấm; ≤ 2 emoji", () => {
  for (const t of ALL_TEMPLATES) assert.ok(t.includes("{w}"), `"${t}" thiếu {w}`);
  for (const t of [...SHOW, ...LONG_SHOW]) assert.ok(t.includes("{m}"), `"${t}" thiếu {m}`);
  for (const t of [...QUIZ, ...QUIZ_OWN, ...LONG_QUIZ]) assert.ok(!t.includes("{m}"), `"${t}" lộ nghĩa`);
  for (const line of [...TITLES, ...ALL_TEMPLATES]) {
    const words = ` ${line.toLowerCase().split(/[^\p{L}]+/u).join(" ")} `; // so theo từ: "ngu" không bắt nhầm "nguồn"
    for (const bad of FORBIDDEN) assert.ok(!words.includes(` ${bad} `), `"${line}" chứa "${bad}"`);
    assert.ok(emojiCount(line) <= 2, `"${line}" quá nhiều emoji`);
    assert.ok(Array.from(line).length <= 70, `"${line}" quá dài`);
  }
});

test("không còn «» và dấu '=' kiểu từ điển", () => {
  for (const d of days(30)) {
    const c = pushCopy({ word: "amygdala", meaning: "hạch hạnh nhân", fromBank: false, seed: "slot-1", now: d });
    assert.ok(!/[«»=]/.test(c.body), c.body);
  }
});

test("cùng khung giờ: Đố và Khoe xen kẽ qua các ngày", () => {
  const bodies = days(14).map((d) => pushCopy({ word: "amygdala", meaning: "hạch hạnh nhân", fromBank: false, seed: "slot-1", now: d }).body);
  const shown = bodies.filter((b) => b.includes("hạch hạnh nhân")).length;
  assert.ok(shown >= 5 && shown <= 9, `khoe ${shown}/14 ngày`);
  for (const b of bodies) assert.ok(b.includes("amygdala"), b);
});

test("Đố: đúng mẫu đã điền từ, không lộ nghĩa; Khoe: điền cả từ lẫn nghĩa", () => {
  for (const d of days(10)) {
    const c = pushCopy({ word: "amygdala", meaning: "hạch hạnh nhân", fromBank: false, seed: "slot-1", now: d });
    assert.ok(TITLES.includes(c.title));
    const quiz = [...QUIZ, ...QUIZ_OWN].map((t) => fill(t, "amygdala"));
    const show = SHOW.map((t) => fill(t, "amygdala", "hạch hạnh nhân"));
    assert.ok(quiz.includes(c.body) || show.includes(c.body), c.body);
  }
});

test("từ kho (chưa lưu) không dùng câu 'mày lưu…'", () => {
  const ownOnly = new Set(QUIZ_OWN.map((t) => fill(t, "go")));
  for (const d of days(40)) {
    for (const seed of ["a", "b", "c"]) {
      const c = pushCopy({ word: "go", meaning: "đi", fromBank: true, seed, now: d });
      assert.ok(!ownOnly.has(c.body), c.body);
    }
  }
});

test("nghĩa nhiều nghĩa → chỉ lấy nghĩa đầu", () => {
  assert.equal(firstMeaning("kiên cường, mau phục hồi"), "kiên cường");
  assert.equal(firstMeaning("  hạch hạnh nhân; (giải phẫu) amiđan  "), "hạch hạnh nhân");
  assert.equal(firstMeaning(""), "");
  assert.equal(firstMeaning(null), "");
});

test("nghĩa rỗng → luôn kiểu Đố", () => {
  const quiz = new Set([...QUIZ, ...QUIZ_OWN].map((t) => fill(t, "x")));
  for (const d of days(10)) assert.ok(quiz.has(pushCopy({ word: "x", meaning: "  ", fromBank: false, seed: "s", now: d }).body));
});

test("nghĩa đầu quá dài (> 40 ký tự) → kiểu Đố, không nhồi nghĩa vào câu", () => {
  const meaning = "một nghĩa khá dài để chiếm gần hết chỗ trong thông báo này";
  for (const d of days(10)) {
    const c = pushCopy({ word: "x", meaning, fromBank: false, seed: "s", now: d });
    assert.ok(!c.body.includes("một nghĩa"), c.body);
  }
});

test("từ dài (câu đã lưu, > 30 ký tự) → mẫu đặt từ ở cuối, cắt ≤ 150 ký tự có …", () => {
  const long = "Người học cần ôn thường xuyên. ".repeat(20);
  for (const d of days(6)) {
    const c = pushCopy({ word: long, meaning: "ôn đi", fromBank: false, seed: "s", now: d });
    assert.ok(Array.from(c.body).length <= 150);
    assert.ok(c.body.endsWith("…"));
    const prefixes = [...LONG_QUIZ, ...LONG_SHOW].map((t) => fill(t.slice(0, t.indexOf("{w}")), "", "ôn đi"));
    assert.ok(prefixes.some((p) => c.body.startsWith(p)), c.body);
  }
});

test("cùng khung giờ: tiêu đề không lặp trong N ngày liên tiếp", () => {
  assert.equal(new Set(days(TITLES.length).map((d) => templateIndex("slot-abc", d, TITLES.length))).size, TITLES.length);
});
