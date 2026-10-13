import test from "node:test";
import assert from "node:assert/strict";
import { OWN_TEMPLATES, BANK_TEMPLATES, FORBIDDEN, pushCopy, templateIndex } from "../../src/lib/push/copy.js";

const all = [...OWN_TEMPLATES, ...BANK_TEMPLATES];
const emojiCount = (s) => (s.match(/\p{Extended_Pictographic}/gu) || []).length;

test("đủ mẫu: 12 cho từ đã lưu, 10 cho từ mới", () => {
  assert.equal(OWN_TEMPLATES.length, 12);
  assert.equal(BANK_TEMPLATES.length, 10);
});

test("mẫu nào cũng chứa đủ từ (tiêu đề) và nghĩa (nội dung)", () => {
  for (const [i, t] of all.entries()) {
    assert.ok(t.title("WORDX").includes("WORDX"), `mẫu ${i} thiếu từ`);
    assert.ok(t.body("MEANINGX").includes("MEANINGX"), `mẫu ${i} thiếu nghĩa`);
  }
});

test("không có từ cấm, mỗi câu tối đa 2 emoji", () => {
  for (const [i, t] of all.entries()) {
    const text = `${t.title("w")} ${t.body("m")}`.toLowerCase();
    const words = ` ${text.split(/[^\p{L}]+/u).join(" ")} `; // so theo từ: "ngu" không bắt nhầm "nguồn"
    for (const bad of FORBIDDEN) assert.ok(!words.includes(` ${bad} `), `mẫu ${i} chứa "${bad}"`);
    assert.ok(emojiCount(t.title("w")) <= 2 && emojiCount(t.body("m")) <= 2, `mẫu ${i} quá nhiều emoji`);
  }
});

test("từ/nghĩa thường → câu lầy, trong giới hạn 100/150 ký tự", () => {
  const c = pushCopy({ word: "resilient", meaning: "kiên cường", fromBank: false, seed: "slot-1", now: new Date("2026-10-13T13:00:00Z") });
  assert.ok(c.title.includes("resilient") && c.body.includes("kiên cường"));
  assert.ok(Array.from(c.title).length <= 100 && Array.from(c.body).length <= 150);
  assert.ok(OWN_TEMPLATES.some((t) => t.title("resilient") === c.title));
});

test("từ kho dùng bộ mẫu từ mới", () => {
  const c = pushCopy({ word: "go", meaning: "đi", fromBank: true, seed: "s", now: new Date() });
  assert.ok(BANK_TEMPLATES.some((t) => t.title("go") === c.title));
});

test("nghĩa quá dài → bỏ câu chọc, giữ nghĩa; từ quá dài → tiêu đề chỉ còn từ", () => {
  const longMeaning = "ý nghĩa rất dài ".repeat(20);
  const c = pushCopy({ word: "x", meaning: longMeaning, fromBank: false, seed: "s", now: new Date() });
  assert.ok(Array.from(c.body).length <= 150);
  assert.ok(c.body.startsWith("ý nghĩa rất dài"), "giữ nghĩa, không giữ câu chọc");
  const longWord = "take something for granted and then some more words ".repeat(3);
  const t = pushCopy({ word: longWord, meaning: "m", fromBank: false, seed: "s", now: new Date() });
  assert.ok(Array.from(t.title).length <= 100);
  assert.ok(t.title.startsWith("take something"));
});

test("nghĩa rỗng → không ghép câu chọc với chuỗi rỗng", () => {
  const c = pushCopy({ word: "x", meaning: "", fromBank: false, seed: "s", now: new Date() });
  assert.equal(c.body, "Chạm vô coi nghĩa liền 👀");
});

test("cùng khung giờ không lặp mẫu trong N ngày liên tiếp (N = số mẫu)", () => {
  const days = Array.from({ length: OWN_TEMPLATES.length }, (_, d) => new Date(Date.UTC(2026, 9, 13 + d, 13)));
  const idx = days.map((now) => templateIndex("slot-abc", now, OWN_TEMPLATES.length));
  assert.equal(new Set(idx).size, OWN_TEMPLATES.length);
});
