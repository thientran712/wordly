// Test hệ số điều chỉnh due_at khi user bấm Dễ/Khó/Bỏ qua lâu hơn trong tab
// "Đã gợi ý". Dùng lại thang EMAIL_INTERVALS đã có cho email, không phải
// FSRS thật (ts-fsrs là code chết, không dùng ở đây — xem spec).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeScheduleUpdate } from "../../src/lib/learning/schedule-adjustment.js";

describe("computeScheduleUpdate", () => {
  test("Dễ: nhảy lên nấc kế tiếp, tăng review_count", () => {
    const result = computeScheduleUpdate({ review_count: 0 }, "easy");
    assert.equal(result.state, "review");
    assert.equal(result.review_count, 1);
    assert.equal(result.scheduled_days, 3); // EMAIL_INTERVALS[1]
  });

  test("Dễ ở nấc cuối: giữ nguyên nấc cuối (90 ngày), review_count vẫn tăng", () => {
    const result = computeScheduleUpdate({ review_count: 5 }, "easy");
    assert.equal(result.scheduled_days, 90);
    assert.equal(result.review_count, 6);
  });

  test("Khó: lùi 1 nấc, review_count không đổi", () => {
    const result = computeScheduleUpdate({ review_count: 2 }, "hard");
    assert.equal(result.scheduled_days, 3); // EMAIL_INTERVALS[1], lùi từ nấc 2 (7 ngày)
    assert.equal(result.review_count, 2);
  });

  test("Khó ở nấc đầu: không lùi dưới 1 ngày", () => {
    const result = computeScheduleUpdate({ review_count: 0 }, "hard");
    assert.equal(result.scheduled_days, 1);
    assert.equal(result.review_count, 0);
  });

  test("Bỏ qua lâu hơn: luôn set nấc cuối (90 ngày), review_count không đổi", () => {
    const result = computeScheduleUpdate({ review_count: 1 }, "skip_longer");
    assert.equal(result.scheduled_days, 90);
    assert.equal(result.review_count, 1);
  });

  test("review_count null/undefined được coi là 0", () => {
    const result = computeScheduleUpdate({ review_count: null }, "easy");
    assert.equal(result.review_count, 1);
    assert.equal(result.scheduled_days, 3);
  });

  test("due_at là ISO string trong tương lai", () => {
    const before = Date.now();
    const result = computeScheduleUpdate({ review_count: 0 }, "easy");
    const dueAt = new Date(result.due_at).getTime();
    assert.ok(dueAt > before, "due_at phải ở tương lai");
  });

  test("rating không hợp lệ thì throw", () => {
    assert.throws(() => computeScheduleUpdate({ review_count: 0 }, "invalid"));
  });
});
