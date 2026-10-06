// Test cho sinh câu hỏi quiz từ kho từ vựng.
//
// Quiz lấy từ kho 7.5k từ sẵn có nên không cần soạn nội dung. Logic sinh
// câu hỏi phải đúng: đáp án nhiễu không được trùng đáp án đúng, và phải có
// đủ lựa chọn, nếu không quiz thành vô nghĩa.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildQuizQuestions,
  pickDistractors,
  QUIZ_MODES,
} from "../../src/lib/quiz-generation.js";

const words = [
  { id: "w1", word: "abandon", def_vi: "bỏ rơi", def_en: "to leave", level: "B2" },
  { id: "w2", word: "beautiful", def_vi: "xinh đẹp", def_en: "pretty", level: "A2" },
  { id: "w3", word: "cautious", def_vi: "thận trọng", def_en: "careful", level: "B2" },
  { id: "w4", word: "diligent", def_vi: "siêng năng", def_en: "hardworking", level: "C1" },
  { id: "w5", word: "eager", def_vi: "háo hức", def_en: "keen", level: "B1" },
  { id: "w6", word: "fragile", def_vi: "dễ vỡ", def_en: "delicate", level: "B2" },
];

describe("pickDistractors", () => {
  test("trả về đúng số lượng yêu cầu", () => {
    const d = pickDistractors(words, "w1", 3);
    assert.equal(d.length, 3);
  });

  test("KHÔNG bao giờ chứa từ đúng", () => {
    for (let i = 0; i < 20; i++) {
      const d = pickDistractors(words, "w1", 3);
      assert.ok(!d.some((w) => w.id === "w1"), "đáp án nhiễu chứa chính đáp án đúng");
    }
  });

  test("không lặp lại cùng một từ nhiễu", () => {
    for (let i = 0; i < 20; i++) {
      const d = pickDistractors(words, "w1", 3);
      const ids = d.map((w) => w.id);
      assert.equal(new Set(ids).size, ids.length, "có từ nhiễu bị lặp");
    }
  });

  test("kho từ ít hơn yêu cầu thì trả về tối đa có thể", () => {
    const small = words.slice(0, 2);
    const d = pickDistractors(small, "w1", 3);
    assert.equal(d.length, 1, "chỉ còn 1 từ khác w1");
  });

  test("đầu vào không hợp lệ trả mảng rỗng", () => {
    assert.deepEqual(pickDistractors(null, "w1", 3), []);
    assert.deepEqual(pickDistractors([], "w1", 3), []);
  });
});

describe("buildQuizQuestions", () => {
  test("sinh đúng số câu yêu cầu", () => {
    const qs = buildQuizQuestions(words, { count: 4, mode: "en_to_vi" });
    assert.equal(qs.length, 4);
  });

  test("không sinh quá số từ có sẵn", () => {
    const qs = buildQuizQuestions(words, { count: 100, mode: "en_to_vi" });
    assert.equal(qs.length, words.length);
  });

  test("chế độ en_to_vi: câu hỏi là từ tiếng Anh, đáp án là nghĩa Việt", () => {
    const [q] = buildQuizQuestions(words, { count: 1, mode: "en_to_vi" });
    assert.ok(words.some((w) => w.word === q.prompt), "prompt phải là từ tiếng Anh");
    assert.ok(q.options.includes(q.correct_answer));
  });

  test("chế độ vi_to_en: câu hỏi là nghĩa Việt, đáp án là từ tiếng Anh", () => {
    const [q] = buildQuizQuestions(words, { count: 1, mode: "vi_to_en" });
    assert.ok(words.some((w) => w.def_vi === q.prompt), "prompt phải là nghĩa Việt");
    assert.ok(q.options.includes(q.correct_answer));
  });

  test("mỗi câu có 4 lựa chọn khi kho từ đủ lớn", () => {
    const qs = buildQuizQuestions(words, { count: 3, mode: "en_to_vi" });
    for (const q of qs) {
      assert.equal(q.options.length, 4, `câu ${q.id} không có 4 lựa chọn`);
    }
  });

  test("đáp án đúng LUÔN nằm trong danh sách lựa chọn", () => {
    for (let i = 0; i < 30; i++) {
      const qs = buildQuizQuestions(words, { count: 5, mode: "en_to_vi" });
      for (const q of qs) {
        assert.ok(
          q.options.includes(q.correct_answer),
          `đáp án đúng "${q.correct_answer}" không có trong lựa chọn`
        );
      }
    }
  });

  test("các lựa chọn không trùng nhau", () => {
    for (let i = 0; i < 30; i++) {
      const qs = buildQuizQuestions(words, { count: 5, mode: "en_to_vi" });
      for (const q of qs) {
        assert.equal(new Set(q.options).size, q.options.length, "lựa chọn bị trùng");
      }
    }
  });

  test("không hỏi trùng từ trong cùng một lượt quiz", () => {
    const qs = buildQuizQuestions(words, { count: 6, mode: "en_to_vi" });
    const ids = qs.map((q) => q.word_id);
    assert.equal(new Set(ids).size, ids.length, "có từ bị hỏi hai lần");
  });

  test("bỏ qua từ thiếu nghĩa Việt ở chế độ cần nghĩa", () => {
    const withGaps = [
      { id: "a", word: "one", def_vi: "một" },
      { id: "b", word: "two", def_vi: "" },
      { id: "c", word: "three", def_vi: null },
      { id: "d", word: "four", def_vi: "bốn" },
      { id: "e", word: "five", def_vi: "năm" },
    ];
    const qs = buildQuizQuestions(withGaps, { count: 5, mode: "en_to_vi" });
    // Chỉ 3 từ có nghĩa Việt hợp lệ
    assert.ok(qs.length <= 3, `sinh ${qs.length} câu từ 3 từ hợp lệ`);
    for (const q of qs) {
      assert.ok(q.correct_answer, "đáp án rỗng");
    }
  });

  test("kho từ quá nhỏ (dưới 2 từ) trả mảng rỗng", () => {
    // Không thể làm trắc nghiệm khi không có từ nhiễu nào
    assert.deepEqual(buildQuizQuestions([words[0]], { count: 1, mode: "en_to_vi" }), []);
  });

  test("đầu vào không hợp lệ trả mảng rỗng, không sập", () => {
    assert.deepEqual(buildQuizQuestions(null, { count: 5 }), []);
    assert.deepEqual(buildQuizQuestions([], {}), []);
  });

  test("chế độ không hỗ trợ trả mảng rỗng", () => {
    assert.deepEqual(buildQuizQuestions(words, { count: 3, mode: "chế-độ-lạ" }), []);
  });

  test("QUIZ_MODES công khai cho UI", () => {
    assert.ok(Array.isArray(QUIZ_MODES));
    assert.ok(QUIZ_MODES.includes("en_to_vi"));
    assert.ok(QUIZ_MODES.includes("vi_to_en"));
  });
});
