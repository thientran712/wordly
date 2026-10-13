import test from "node:test";
import assert from "node:assert/strict";
import { TITLES, OWN_QUIPS, BANK_QUIPS, FORBIDDEN, pushCopy, templateIndex } from "../../src/lib/push/copy.js";

// Bố cục banner (chủ dự án duyệt 13/10/2026): màn hình khoá chỉ cho tiêu đề
// 1 dòng → tiêu đề là câu gọi ngắn; dòng 1 nội dung = «từ» = “nghĩa” (liếc
// là ôn), dòng 2 = câu chọc.
const emojiCount = (s) => (s.match(/\p{Extended_Pictographic}/gu) || []).length;
const now = new Date("2026-10-13T13:00:00Z");

test("đủ mẫu: ≥ 10 tiêu đề, ≥ 10 câu chọc mỗi loại", () => {
  assert.ok(TITLES.length >= 10);
  assert.ok(OWN_QUIPS.length >= 10);
  assert.ok(BANK_QUIPS.length >= 8);
});

test("tiêu đề ≤ 16 ký tự — không bao giờ bị iOS cắt '…' trên màn hình khoá", () => {
  for (const t of TITLES) assert.ok(Array.from(t).length <= 16, `"${t}" dài ${Array.from(t).length}`);
});

test("câu chọc ≤ 60 ký tự (vừa 1 dòng rưỡi), không từ cấm, tối đa 2 emoji", () => {
  for (const line of [...TITLES, ...OWN_QUIPS, ...BANK_QUIPS]) {
    const words = ` ${line.toLowerCase().split(/[^\p{L}]+/u).join(" ")} `; // so theo từ: "ngu" không bắt nhầm "nguồn"
    for (const bad of FORBIDDEN) assert.ok(!words.includes(` ${bad} `), `"${line}" chứa "${bad}"`);
    assert.ok(emojiCount(line) <= 2, `"${line}" quá nhiều emoji`);
  }
  for (const q of [...OWN_QUIPS, ...BANK_QUIPS]) assert.ok(Array.from(q).length <= 60, `"${q}" quá dài`);
});

test("nội dung: dòng 1 = «từ» = “nghĩa”, dòng 2 = câu chọc đúng loại", () => {
  const c = pushCopy({ word: "resilient", meaning: "kiên cường", fromBank: false, seed: "slot-1", now });
  assert.ok(TITLES.includes(c.title));
  const [line1, line2] = c.body.split("\n");
  assert.equal(line1, "«resilient» = “kiên cường”");
  assert.ok(OWN_QUIPS.includes(line2));
  const b = pushCopy({ word: "go", meaning: "đi", fromBank: true, seed: "slot-1", now });
  assert.ok(BANK_QUIPS.includes(b.body.split("\n")[1]));
});

test("từ + nghĩa dài → bỏ câu chọc, giữ nguyên dòng 1 (≤ 150 ký tự)", () => {
  const meaning = "một nghĩa khá dài để chiếm gần hết chỗ ".repeat(3);
  const c = pushCopy({ word: "x", meaning, fromBank: false, seed: "s", now });
  assert.ok(!c.body.includes("\n"));
  assert.ok(c.body.startsWith("«x» = “một nghĩa"));
  assert.ok(Array.from(c.body).length <= 150);
});

test("từ + nghĩa cực dài (câu đã lưu) → cắt dòng 1 còn ≤ 150 ký tự, có …", () => {
  const long = "Người học cần ôn thường xuyên. ".repeat(20);
  const c = pushCopy({ word: long, meaning: long, fromBank: false, seed: "s", now });
  assert.ok(Array.from(c.body).length <= 150);
  assert.ok(c.body.endsWith("…"));
});

test("nghĩa rỗng → «từ» + câu nhắc bấm xem nghĩa", () => {
  const c = pushCopy({ word: "x", meaning: "  ", fromBank: false, seed: "s", now });
  assert.equal(c.body, "«x» — chạm vô coi nghĩa liền 👀");
});

test("cùng khung giờ: tiêu đề và câu chọc không lặp trong N ngày liên tiếp", () => {
  const days = (n) => Array.from({ length: n }, (_, d) => new Date(Date.UTC(2026, 9, 13 + d, 13)));
  assert.equal(new Set(days(TITLES.length).map((d) => templateIndex("slot-abc", d, TITLES.length))).size, TITLES.length);
  assert.equal(new Set(days(OWN_QUIPS.length).map((d) => templateIndex("slot-abc:q", d, OWN_QUIPS.length))).size, OWN_QUIPS.length);
});
