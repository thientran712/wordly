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
  bankWordToQuizWord,
} from "../../src/lib/learning/quiz-generation.js";

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

// ── Kho từ (bảng words) ──────────────────────────────────────────────────
// LỖI THẬT (6/10/2026): /api/quiz đọc cột words.def_vi — KHÔNG tồn tại (bảng
// chỉ có def_en). Người có < 4 từ đã lưu (gần như mọi người mới) bị 500
// "Không tải được từ vựng" trên cả web lẫn iOS. Kho từ dùng nghĩa tiếng Anh.

describe("bankWordToQuizWord", () => {
  test("dùng def_en làm nghĩa (bảng words không có def_vi)", () => {
    const w = bankWordToQuizWord({ id: "w1", word: "Advice", def_en: "an opinion about what somebody should do", level: "A1" });
    assert.deepEqual(w, { id: "w1", word: "Advice", def_vi: "an opinion about what somebody should do", level: "A1" });
  });

  test("thiếu def_en hoặc word → null (bị loại)", () => {
    assert.equal(bankWordToQuizWord({ id: "w1", word: "x", def_en: "" }), null);
    assert.equal(bankWordToQuizWord({ id: "w1", word: "", def_en: "y" }), null);
    assert.equal(bankWordToQuizWord(null), null);
  });

  test("từ kho tạo được câu hỏi quiz en_to_vi", () => {
    const rows = ["a", "b", "c", "d", "e"].map((x, i) => ({ id: `w${i}`, word: x, def_en: `meaning ${x}`, level: "A1" }));
    const qs = buildQuizQuestions(rows.map(bankWordToQuizWord), { count: 3, mode: "en_to_vi" });
    assert.equal(qs.length, 3);
    for (const q of qs) assert.equal(q.options.length, 4);
  });
});

// ── Quiz review 23/10/2026: từ đã lưu hai chiều, bỏ câu dài/trùng, đáp án
// nhiễu không cùng nghĩa, ưu tiên từ cần ôn lại, đóng vòng ôn khi trả lời đúng.
import {
  savedRowToQuizWord,
  dedupeQuizWords,
  orderForQuiz,
  quizShortfall,
  MIN_QUIZ_WORDS,
  reviewUpdates,
} from "../../src/lib/learning/quiz-generation.js";

describe("savedRowToQuizWord", () => {
  test("EN→VI: từ là câu gốc, nghĩa là bản dịch (đã trim)", () => {
    const w = savedRowToQuizWord({ id: "a", source_text: " run ", translated_text: " chạy ", direction: "EN→VI" });
    assert.deepEqual(w, { id: "a", word: "run", def_vi: "chạy", state: null, due_at: null });
  });

  test("VI→EN: đảo lại — từ tiếng Anh là bản dịch", () => {
    const w = savedRowToQuizWord({ id: "b", source_text: "chạy", translated_text: "run", direction: "VI→EN", state: "relearning", due_at: "2026-10-24T00:00:00Z" });
    assert.deepEqual(w, { id: "b", word: "run", def_vi: "chạy", state: "relearning", due_at: "2026-10-24T00:00:00Z" });
  });

  test("câu dài (> 6 từ hoặc > 60 ký tự) bị loại", () => {
    assert.equal(savedRowToQuizWord({ id: "c", source_text: "I would like to order a cup of coffee", translated_text: "Tôi muốn gọi cà phê", direction: "EN→VI" }), null);
    assert.equal(savedRowToQuizWord({ id: "d", source_text: "a".repeat(61), translated_text: "x", direction: "EN→VI" }), null);
  });

  test("thiếu chữ → null", () => {
    assert.equal(savedRowToQuizWord({ id: "e", source_text: "run", translated_text: " ", direction: "EN→VI" }), null);
    assert.equal(savedRowToQuizWord(null), null);
  });
});

describe("dedupeQuizWords", () => {
  test("bỏ từ trùng không phân biệt hoa thường, giữ dòng đầu", () => {
    const out = dedupeQuizWords([
      { id: "1", word: "Run", def_vi: "chạy" },
      { id: "2", word: "run", def_vi: "chạy bộ" },
      { id: "3", word: "walk", def_vi: "đi bộ" },
    ]);
    assert.deepEqual(out.map((w) => w.id), ["1", "3"]);
  });
});

describe("quizShortfall", () => {
  test("cần tối thiểu 4 từ — trả số từ còn thiếu", () => {
    assert.equal(MIN_QUIZ_WORDS, 4);
    assert.equal(quizShortfall(0), 4);
    assert.equal(quizShortfall(3), 1);
    assert.equal(quizShortfall(4), 0);
    assert.equal(quizShortfall(30), 0);
  });
});

describe("orderForQuiz", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  test("từ đang ôn lại đã đến hạn lên đầu (quá hạn lâu nhất trước)", () => {
    const list = [
      { id: "n1", word: "a", def_vi: "x" },
      { id: "d2", word: "b", def_vi: "y", state: "relearning", due_at: "2026-10-23T10:00:00Z" },
      { id: "n2", word: "c", def_vi: "z" },
      { id: "d1", word: "d", def_vi: "w", state: "relearning", due_at: "2026-10-22T10:00:00Z" },
      { id: "f", word: "e", def_vi: "v", state: "relearning", due_at: "2026-10-30T10:00:00Z" },
    ];
    const out = orderForQuiz(list, now);
    assert.deepEqual(out.slice(0, 2).map((w) => w.id), ["d1", "d2"]);
    assert.equal(out.length, 5);
  });

  test("buildQuizQuestions hỏi từ đến hạn trước khi chọn ngẫu nhiên", () => {
    const list = [
      ...words,
      { id: "due", word: "zealous", def_vi: "nhiệt huyết", state: "relearning", due_at: "2026-10-20T00:00:00Z" },
    ];
    for (let i = 0; i < 10; i++) {
      const qs = buildQuizQuestions(list, { count: 2, mode: "en_to_vi", now });
      assert.ok(qs.some((q) => q.word_id === "due"), "từ cần ôn lại phải có trong lượt");
    }
  });
});

describe("đáp án nhiễu", () => {
  test("vi_to_en: không lấy từ khác có CÙNG nghĩa làm đáp án nhiễu (2 đáp án đúng)", () => {
    const list = [
      { id: "big", word: "big", def_vi: "lớn" },
      { id: "large", word: "large", def_vi: "Lớn" },
      { id: "x1", word: "cat", def_vi: "con mèo" },
      { id: "x2", word: "dog", def_vi: "con chó" },
      { id: "x3", word: "bird", def_vi: "con chim" },
    ];
    for (let i = 0; i < 30; i++) {
      const qs = buildQuizQuestions(list, { count: 5, mode: "vi_to_en" });
      const q = qs.find((q) => q.word_id === "big");
      assert.ok(!q.options.includes("large"), "“large” cũng nghĩa là “lớn”");
    }
  });

  test("ưu tiên đáp án nhiễu dài gần bằng đáp án đúng", () => {
    const list = [
      { id: "q", word: "run", def_vi: "chạy" },
      { id: "s1", word: "eat", def_vi: "ăn" },
      { id: "s2", word: "go", def_vi: "đi" },
      { id: "s3", word: "sit", def_vi: "ngồi" },
      { id: "s4", word: "lie", def_vi: "nằm" },
      { id: "l1", word: "l1", def_vi: "một nghĩa rất rất dài để lộ đáp án số một" },
      { id: "l2", word: "l2", def_vi: "một nghĩa rất rất dài để lộ đáp án số hai" },
      { id: "l3", word: "l3", def_vi: "một nghĩa rất rất dài để lộ đáp án số ba" },
    ];
    for (let i = 0; i < 30; i++) {
      const q = buildQuizQuestions(list, { count: 8, mode: "en_to_vi" }).find((q) => q.word_id === "q");
      const longOnes = q.options.filter((o) => o.length > 20);
      assert.ok(longOnes.length <= 1, `quá nhiều đáp án dài: ${q.options}`);
    }
  });
});

describe("reviewUpdates", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  test("sai → ôn lại; đúng một từ đang ôn lại → thoát ôn lại; đúng từ thường → không đổi", () => {
    const details = {
      q1: { word_id: "w-wrong", correct: false },
      q2: { word_id: "w-recovered", correct: true },
      q3: { word_id: "w-fine", correct: true },
    };
    const rows = new Map([
      ["w-wrong", { state: "review" }],
      ["w-recovered", { state: "relearning", due_at: "2026-10-23T09:00:00Z" }],
      ["w-fine", { state: "review" }],
    ]);
    const u = reviewUpdates(details, rows, now);
    assert.deepEqual(u.wrongIds, ["w-wrong"]);
    assert.deepEqual(u.recoveredIds, ["w-recovered"]);
    assert.equal(u.relearnDueAt, "2026-10-24T12:00:00.000Z");
    assert.equal(u.recoveredDueAt, "2026-10-26T12:00:00.000Z");
  });

  test("đúng ngay sau khi vừa sai (chưa tới hạn ôn) → vẫn ôn lại, thông báo ngày mai vẫn nhắc", () => {
    const u = reviewUpdates(
      { q: { word_id: "w", correct: true } },
      new Map([["w", { state: "relearning", due_at: "2026-10-24T11:00:00Z" }]]),
      now
    );
    assert.deepEqual(u.recoveredIds, []);
  });

  test("từ kho chung (không có trong rows) bị bỏ qua", () => {
    const u = reviewUpdates({ q: { word_id: "bank", correct: false } }, new Map(), now);
    assert.deepEqual(u.wrongIds, []);
  });
});
