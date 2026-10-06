// Test cho tính học phí và công nợ.
//
// Đây là nghiệp vụ TÀI CHÍNH: sai số tiền là mất tiền thật của trung tâm
// hoặc thu sai của phụ huynh. Phủ kỹ ca biên, nhất là làm tròn và số âm.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateTuition,
  computeBalance,
  formatVnd,
  TUITION_MODELS,
} from "../../src/lib/tuition-calc.js";

describe("formatVnd", () => {
  test("định dạng số tiền theo kiểu Việt Nam", () => {
    assert.equal(formatVnd(1500000), "1.500.000 ₫");
    assert.equal(formatVnd(0), "0 ₫");
    assert.equal(formatVnd(999), "999 ₫");
  });

  test("xử lý giá trị không hợp lệ", () => {
    assert.equal(formatVnd(null), "0 ₫");
    assert.equal(formatVnd(NaN), "0 ₫");
    assert.equal(formatVnd("abc"), "0 ₫");
  });

  test("số âm hiển thị dấu trừ", () => {
    assert.equal(formatVnd(-500000), "-500.000 ₫");
  });
});

describe("calculateTuition — theo khoá (per_course)", () => {
  test("tính đúng số tiền cơ bản", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 3000000 });
    assert.equal(r.subtotal, 3000000);
    assert.equal(r.total, 3000000);
  });

  test("áp dụng giảm giá theo phần trăm", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 3000000, discount_percent: 10 });
    assert.equal(r.discount_amount, 300000);
    assert.equal(r.total, 2700000);
  });

  test("áp dụng giảm giá số tiền cố định", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 3000000, discount_amount: 500000 });
    assert.equal(r.total, 2500000);
  });

  test("giảm giá không làm tổng thành số âm", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 1000000, discount_amount: 5000000 });
    assert.equal(r.total, 0, "tổng phải bị chặn ở 0, không âm");
  });

  test("giảm giá quá 100% bị chặn ở 100%", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 1000000, discount_percent: 150 });
    assert.equal(r.total, 0);
  });
});

describe("calculateTuition — theo buổi (per_session)", () => {
  test("nhân giá buổi với số buổi", () => {
    const r = calculateTuition({ model: "per_session", session_fee: 150000, session_count: 20 });
    assert.equal(r.subtotal, 3000000);
    assert.equal(r.total, 3000000);
  });

  test("số buổi 0 thì học phí 0", () => {
    const r = calculateTuition({ model: "per_session", session_fee: 150000, session_count: 0 });
    assert.equal(r.total, 0);
  });

  test("kết hợp số buổi và giảm giá", () => {
    const r = calculateTuition({
      model: "per_session",
      session_fee: 100000,
      session_count: 10,
      discount_percent: 20,
    });
    assert.equal(r.subtotal, 1000000);
    assert.equal(r.discount_amount, 200000);
    assert.equal(r.total, 800000);
  });
});

describe("calculateTuition — theo tháng (per_month)", () => {
  test("nhân phí tháng với số tháng", () => {
    const r = calculateTuition({ model: "per_month", monthly_fee: 800000, month_count: 3 });
    assert.equal(r.total, 2400000);
  });
});

describe("calculateTuition — ca biên", () => {
  test("làm tròn về số nguyên đồng (VND không có xu)", () => {
    const r = calculateTuition({ model: "per_course", course_fee: 1000000, discount_percent: 33.33 });
    assert.ok(Number.isInteger(r.total), `tổng phải là số nguyên, nhận ${r.total}`);
    assert.ok(Number.isInteger(r.discount_amount));
  });

  test("mô hình không hỗ trợ trả về lỗi rõ ràng", () => {
    const r = calculateTuition({ model: "mô-hình-lạ", course_fee: 100000 });
    assert.equal(r.ok, false);
    assert.ok(r.error);
  });

  test("số tiền âm bị từ chối", () => {
    const r = calculateTuition({ model: "per_course", course_fee: -100000 });
    assert.equal(r.ok, false);
  });

  test("thiếu tham số bắt buộc bị từ chối", () => {
    assert.equal(calculateTuition({ model: "per_session", session_fee: 100000 }).ok, false);
    assert.equal(calculateTuition({ model: "per_course" }).ok, false);
  });

  test("đầu vào rỗng không làm sập", () => {
    assert.equal(calculateTuition(null).ok, false);
    assert.equal(calculateTuition({}).ok, false);
  });

  test("TUITION_MODELS công khai cho UI", () => {
    assert.ok(TUITION_MODELS.includes("per_course"));
    assert.ok(TUITION_MODELS.includes("per_session"));
    assert.ok(TUITION_MODELS.includes("per_month"));
  });
});

describe("computeBalance", () => {
  test("chưa đóng gì thì nợ toàn bộ", () => {
    const b = computeBalance(3000000, []);
    assert.equal(b.paid, 0);
    assert.equal(b.outstanding, 3000000);
    assert.equal(b.status, "unpaid");
  });

  test("đóng đủ thì hết nợ", () => {
    const b = computeBalance(3000000, [{ amount: 3000000 }]);
    assert.equal(b.paid, 3000000);
    assert.equal(b.outstanding, 0);
    assert.equal(b.status, "paid");
  });

  test("đóng nhiều lần được cộng dồn", () => {
    const b = computeBalance(3000000, [{ amount: 1000000 }, { amount: 500000 }]);
    assert.equal(b.paid, 1500000);
    assert.equal(b.outstanding, 1500000);
    assert.equal(b.status, "partial");
  });

  test("đóng thừa: nợ về 0, ghi nhận số thừa", () => {
    const b = computeBalance(1000000, [{ amount: 1500000 }]);
    assert.equal(b.outstanding, 0, "nợ không được âm");
    assert.equal(b.overpaid, 500000);
    assert.equal(b.status, "paid");
  });

  test("bỏ qua khoản thanh toán không hợp lệ", () => {
    const b = computeBalance(1000000, [
      { amount: 500000 },
      { amount: -100000 },   // âm — bỏ qua
      { amount: null },      // rỗng — bỏ qua
      { amount: "abc" },     // sai kiểu — bỏ qua
    ]);
    assert.equal(b.paid, 500000);
  });

  test("danh sách thanh toán không hợp lệ coi như chưa đóng", () => {
    assert.equal(computeBalance(1000000, null).paid, 0);
    assert.equal(computeBalance(1000000, "abc").paid, 0);
  });

  test("học phí 0 thì coi như đã đóng đủ", () => {
    const b = computeBalance(0, []);
    assert.equal(b.status, "paid");
    assert.equal(b.outstanding, 0);
  });
});
