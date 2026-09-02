// Tính học phí và công nợ — logic thuần, test được không cần DB.
// Xem tests/unit/tuition-calc.test.mjs (26 ca).
//
// Đây là nghiệp vụ TÀI CHÍNH: sai số tiền là mất tiền thật của trung tâm
// hoặc thu sai của phụ huynh. Nguyên tắc:
//   • Mọi số tiền là SỐ NGUYÊN đồng (VND không có đơn vị nhỏ hơn)
//   • Không bao giờ trả về số âm cho tổng tiền hoặc công nợ
//   • Đầu vào sai thì trả { ok: false, error } thay vì đoán

// Ba mô hình học phí phổ biến ở trung tâm Anh ngữ Việt Nam.
// Đây là điểm khả biến loại 4 (nghiệp vụ khác bản chất) trong spec —
// giải bằng nhánh có chủ đích, không phải if theo tên trung tâm.
export const TUITION_MODELS = ["per_course", "per_session", "per_month"];

/** Định dạng tiền Việt: 1500000 → "1.500.000 ₫" */
export function formatVnd(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0 ₫";
  // vi-VN dùng dấu chấm làm phân cách nghìn
  return `${Math.round(n).toLocaleString("vi-VN")} ₫`;
}

function isNonNegativeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

/**
 * Tính học phí cho một lần ghi nhận.
 *
 * Trả về { ok, subtotal, discount_amount, total } hoặc { ok: false, error }.
 */
export function calculateTuition(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Thiếu thông tin tính học phí" };
  }

  const { model } = input;
  if (!TUITION_MODELS.includes(model)) {
    return { ok: false, error: `Mô hình học phí không hỗ trợ: ${model}` };
  }

  let subtotal;

  if (model === "per_course") {
    if (!isNonNegativeNumber(input.course_fee)) {
      return { ok: false, error: "Thiếu hoặc sai học phí khoá" };
    }
    subtotal = Number(input.course_fee);
  } else if (model === "per_session") {
    if (!isNonNegativeNumber(input.session_fee)) {
      return { ok: false, error: "Thiếu hoặc sai giá mỗi buổi" };
    }
    if (!isNonNegativeNumber(input.session_count)) {
      return { ok: false, error: "Thiếu hoặc sai số buổi" };
    }
    subtotal = Number(input.session_fee) * Number(input.session_count);
  } else {
    // per_month
    if (!isNonNegativeNumber(input.monthly_fee)) {
      return { ok: false, error: "Thiếu hoặc sai học phí tháng" };
    }
    if (!isNonNegativeNumber(input.month_count)) {
      return { ok: false, error: "Thiếu hoặc sai số tháng" };
    }
    subtotal = Number(input.monthly_fee) * Number(input.month_count);
  }

  subtotal = Math.round(subtotal);

  // ── Giảm giá ──
  // Hỗ trợ cả phần trăm và số tiền cố định. Nếu có cả hai thì áp phần trăm
  // trước rồi trừ tiếp số tiền cố định.
  let discount = 0;

  const percent = Number(input.discount_percent);
  if (Number.isFinite(percent) && percent > 0) {
    // Chặn trên 100% để không thành cộng tiền cho học viên
    const capped = Math.min(percent, 100);
    discount += Math.round((subtotal * capped) / 100);
  }

  const fixed = Number(input.discount_amount);
  if (Number.isFinite(fixed) && fixed > 0) {
    discount += Math.round(fixed);
  }

  // Giảm giá không được vượt tổng — tổng tiền tối thiểu là 0
  discount = Math.min(discount, subtotal);

  return {
    ok: true,
    model,
    subtotal,
    discount_amount: discount,
    total: Math.max(0, subtotal - discount),
  };
}

/**
 * Tính công nợ từ học phí và danh sách đã đóng.
 *
 * Trả về { total, paid, outstanding, overpaid, status }
 * status: 'paid' | 'partial' | 'unpaid'
 */
export function computeBalance(totalDue, payments) {
  const total = Math.max(0, Math.round(Number(totalDue) || 0));

  let paid = 0;
  if (Array.isArray(payments)) {
    for (const p of payments) {
      const amount = Number(p?.amount);
      // Bỏ qua khoản không hợp lệ thay vì để nó làm sai toàn bộ sổ sách.
      // Khoản âm phải được ghi nhận bằng phiếu hoàn tiền riêng, không phải
      // bằng số âm trong danh sách thanh toán.
      if (!Number.isFinite(amount) || amount <= 0) continue;
      paid += Math.round(amount);
    }
  }

  const outstanding = Math.max(0, total - paid);
  const overpaid = Math.max(0, paid - total);

  let status;
  if (outstanding === 0) status = "paid";
  else if (paid > 0) status = "partial";
  else status = "unpaid";

  return { total, paid, outstanding, overpaid, status };
}
