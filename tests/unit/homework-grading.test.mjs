// Test cho chấm điểm tự động.
//
// Đây là logic sinh ra ĐIỂM của học viên — sai là ảnh hưởng trực tiếp tới
// người học và uy tín của trung tâm. Phải có test đầy đủ, gồm cả ca biên.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  gradeSubmission,
  stripAnswers,
  normalizeTextAnswer,
  computeTotalPoints,
} from "../../src/lib/homework-grading.js";

const mcq = {
  id: "q1",
  type: "mcq",
  prompt: "Chọn đáp án đúng",
  points: 2,
  options: ["a", "b", "c"],
  answer: 1, // index
};

const fill = {
  id: "q2",
  type: "fill",
  prompt: "Điền từ",
  points: 3,
  answer: "beautiful",
};

const essay = {
  id: "q3",
  type: "essay",
  prompt: "Viết đoạn văn",
  points: 5,
};

describe("normalizeTextAnswer", () => {
  test("bỏ khoảng trắng đầu cuối và chuyển chữ thường", () => {
    assert.equal(normalizeTextAnswer("  Beautiful  "), "beautiful");
  });

  test("gộp khoảng trắng liên tiếp thành một", () => {
    assert.equal(normalizeTextAnswer("very   good"), "very good");
  });

  test("bỏ dấu câu ở cuối", () => {
    assert.equal(normalizeTextAnswer("beautiful."), "beautiful");
    assert.equal(normalizeTextAnswer("beautiful!"), "beautiful");
  });

  test("giá trị không phải chuỗi trả về chuỗi rỗng", () => {
    assert.equal(normalizeTextAnswer(null), "");
    assert.equal(normalizeTextAnswer(42), "");
    assert.equal(normalizeTextAnswer(undefined), "");
  });
});

describe("stripAnswers", () => {
  test("bỏ trường answer khỏi mọi câu hỏi", () => {
    const result = stripAnswers([mcq, fill, essay]);
    for (const q of result) {
      assert.equal("answer" in q, false, `câu ${q.id} vẫn còn đáp án`);
    }
  });

  test("giữ nguyên các trường học viên cần thấy", () => {
    const [q] = stripAnswers([mcq]);
    assert.equal(q.id, "q1");
    assert.equal(q.prompt, "Chọn đáp án đúng");
    assert.equal(q.points, 2);
    assert.deepEqual(q.options, ["a", "b", "c"]);
  });

  test("không làm hỏng mảng gốc", () => {
    const original = [{ ...mcq }];
    stripAnswers(original);
    assert.equal(original[0].answer, 1, "mảng gốc bị sửa");
  });

  test("xử lý đầu vào không hợp lệ", () => {
    assert.deepEqual(stripAnswers(null), []);
    assert.deepEqual(stripAnswers("không phải mảng"), []);
  });
});

describe("computeTotalPoints", () => {
  test("cộng điểm mọi câu", () => {
    assert.equal(computeTotalPoints([mcq, fill, essay]), 10);
  });

  test("câu thiếu points tính là 0", () => {
    assert.equal(computeTotalPoints([{ id: "x", type: "mcq" }]), 0);
  });

  test("mảng rỗng trả 0", () => {
    assert.equal(computeTotalPoints([]), 0);
  });
});

describe("gradeSubmission", () => {
  test("chấm đúng câu trắc nghiệm", () => {
    const r = gradeSubmission([mcq], { q1: 1 });
    assert.equal(r.auto_score, 2);
    assert.equal(r.auto_max, 2);
    assert.equal(r.needs_manual, false);
    assert.equal(r.details.q1.correct, true);
  });

  test("chấm sai câu trắc nghiệm được 0", () => {
    const r = gradeSubmission([mcq], { q1: 0 });
    assert.equal(r.auto_score, 0);
    assert.equal(r.details.q1.correct, false);
  });

  test("chấm câu điền từ, không phân biệt chữ hoa và khoảng trắng", () => {
    assert.equal(gradeSubmission([fill], { q2: "beautiful" }).auto_score, 3);
    assert.equal(gradeSubmission([fill], { q2: "  BEAUTIFUL " }).auto_score, 3);
    assert.equal(gradeSubmission([fill], { q2: "ugly" }).auto_score, 0);
  });

  test("câu điền từ chấp nhận nhiều đáp án đúng", () => {
    const multi = { id: "q", type: "fill", points: 2, answer: ["big", "large"] };
    assert.equal(gradeSubmission([multi], { q: "large" }).auto_score, 2);
    assert.equal(gradeSubmission([multi], { q: "BIG" }).auto_score, 2);
    assert.equal(gradeSubmission([multi], { q: "small" }).auto_score, 0);
  });

  test("câu tự luận KHÔNG chấm tự động, đánh dấu cần chấm tay", () => {
    const r = gradeSubmission([essay], { q3: "Bài viết của em..." });
    assert.equal(r.needs_manual, true);
    assert.equal(r.auto_max, 0, "câu tự luận không tính vào điểm tự động");
    assert.equal(r.manual_max, 5);
  });

  test("bài trộn câu khách quan và tự luận", () => {
    const r = gradeSubmission([mcq, fill, essay], { q1: 1, q2: "beautiful", q3: "..." });
    assert.equal(r.auto_score, 5, "2 + 3 điểm khách quan");
    assert.equal(r.auto_max, 5);
    assert.equal(r.manual_max, 5);
    assert.equal(r.needs_manual, true);
  });

  test("không trả lời được 0, không lỗi", () => {
    const r = gradeSubmission([mcq, fill], {});
    assert.equal(r.auto_score, 0);
    assert.equal(r.details.q1.correct, false);
  });

  test("câu ghép đôi chấm đúng khi khớp toàn bộ", () => {
    const match = {
      id: "q",
      type: "match",
      points: 4,
      answer: { a: "1", b: "2" },
    };
    assert.equal(gradeSubmission([match], { q: { a: "1", b: "2" } }).auto_score, 4);
    // Ghép đôi sai một phần → không có điểm (all-or-nothing)
    assert.equal(gradeSubmission([match], { q: { a: "1", b: "3" } }).auto_score, 0);
    assert.equal(gradeSubmission([match], { q: { a: "1" } }).auto_score, 0);
  });

  test("loại câu hỏi lạ được bỏ qua an toàn", () => {
    const weird = { id: "q", type: "loại-lạ", points: 3 };
    const r = gradeSubmission([weird], { q: "gì đó" });
    assert.equal(r.auto_score, 0);
    // Không được âm thầm tính là đúng
    assert.equal(r.details.q?.correct, false);
  });

  test("đầu vào không hợp lệ không làm sập", () => {
    const r = gradeSubmission(null, null);
    assert.equal(r.auto_score, 0);
    assert.equal(r.needs_manual, false);
  });

  test("điểm không bao giờ âm hoặc vượt tổng", () => {
    const r = gradeSubmission([mcq, fill], { q1: 1, q2: "beautiful" });
    assert.ok(r.auto_score >= 0);
    assert.ok(r.auto_score <= r.auto_max);
  });
});
