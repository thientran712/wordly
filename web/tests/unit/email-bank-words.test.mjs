// Test chọn từ từ kho 7.5k từ để gửi kèm email nhắc học.
//
// Email trộn từ đã lưu + 1 từ mới từ kho. Từ kho KHÔNG được trùng từ người
// dùng đã lưu/đã dịch (học lại thứ đã biết là vô ích), không lặp từ kho đã gửi
// gần đây, và không trùng nhau trong cùng một email.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWord,
  pickBankWords,
  levelsForSkill,
} from "../../src/lib/email/select-word-for-email.js";

const bank = [
  { id: "b1", word: "Resilient", def_vi: "kiên cường" },
  { id: "b2", word: "eager", def_vi: "háo hức" },
  { id: "b3", word: "  resilient ", def_vi: "kiên cường (trùng)" },
  { id: "b4", word: "fragile", def_vi: "", def_en: "" },
  { id: "b5", word: "diligent", def_vi: "siêng năng" },
  { id: "b6", word: "Candid", def_en: "honest and direct" },
];

describe("normalizeWord", () => {
  test("bỏ hoa/thường, khoảng trắng thừa, dấu câu cuối", () => {
    assert.equal(normalizeWord("  Hello   World! "), "hello world");
    assert.equal(normalizeWord("Resilient."), "resilient");
    assert.equal(normalizeWord(null), "");
  });
});

describe("pickBankWords", () => {
  test("bỏ từ người dùng đã có (so sánh đã chuẩn hoá)", () => {
    const picks = pickBankWords(bank, 3, { excludeWords: new Set(["resilient"]) });
    assert.deepEqual(picks.map((p) => p.id), ["b2", "b5", "b6"]);
  });

  test("bỏ từ kho đã gửi gần đây (theo id)", () => {
    const picks = pickBankWords(bank, 1, { excludeIds: new Set(["b1"]) });
    assert.deepEqual(picks.map((p) => p.id), ["b2"]);
  });

  test("không trùng nhau trong cùng lượt và bỏ từ không có nghĩa nào", () => {
    const picks = pickBankWords(bank, 10);
    assert.deepEqual(picks.map((p) => p.id), ["b1", "b2", "b5", "b6"]);
  });

  // Production chưa có cột words.def_vi → dùng định nghĩa tiếng Anh, chữ thường
  test("thiếu nghĩa Việt thì dùng def_en", () => {
    const [p] = pickBankWords([{ id: "b6", word: "Candid", def_en: "honest and direct" }], 1);
    assert.deepEqual(p, { id: "b6", word: "candid", meaning_vi: "honest and direct", review_count: 0, step: "bank" });
  });

  test("trả về đúng dạng từ email (step = bank, chưa ôn lần nào)", () => {
    const [p] = pickBankWords(bank, 1);
    assert.deepEqual(p, { id: "b1", word: "resilient", meaning_vi: "kiên cường", review_count: 0, step: "bank" });
  });

  test("count = 0 hoặc kho rỗng → mảng rỗng", () => {
    assert.deepEqual(pickBankWords(bank, 0), []);
    assert.deepEqual(pickBankWords([], 2), []);
  });
});

describe("levelsForSkill", () => {
  test("trình độ hiện tại + một bậc trên (i+1)", () => {
    assert.deepEqual(levelsForSkill("B1"), ["B1", "B2"]);
    assert.deepEqual(levelsForSkill("C2"), ["C2"]);
  });

  test("trình độ lạ → mặc định B1", () => {
    assert.deepEqual(levelsForSkill("beginner"), ["B1", "B2"]);
    assert.deepEqual(levelsForSkill(undefined), ["B1", "B2"]);
  });
});
