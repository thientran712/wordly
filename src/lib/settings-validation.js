// Validate cấu hình tổ chức — logic thuần, test được không cần DB.
// Xem tests/unit/settings-validation.test.mjs (23 ca).
//
// Vì sao cần: cấu hình sai kiểu làm hỏng nghiệp vụ âm thầm.
// active_threshold_days = "abc" khiến dashboard phân loại sai;
// join_code_ttl_days = 0 khiến mã lớp hết hạn ngay khi tạo.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Schema cho từng cấu hình. Công khai để UI dựng form tự động — thêm cấu
 * hình mới chỉ cần thêm một dòng ở đây và ở DEFAULT_SETTINGS.
 */
export const SETTING_SCHEMA = {
  active_threshold_days: {
    type: "int",
    min: 1,
    max: 365,
    label: "Ngưỡng 'đang học tốt' (ngày)",
    help: "Học viên hoạt động trong bao nhiêu ngày thì tính là đang học tốt",
  },
  stalled_threshold_days: {
    type: "int",
    min: 1,
    max: 365,
    label: "Ngưỡng 'chững lại' (ngày)",
    help: "Quá số ngày này mà không hoạt động thì tính là đã bỏ",
  },
  default_email_times: {
    type: "time_array",
    maxItems: 10,
    label: "Giờ gửi email mặc định",
    help: "Áp dụng cho học viên mới của trung tâm",
  },
  grading_scale: {
    type: "enum",
    values: ["ten", "ielts", "percent"],
    labels: { ten: "Thang 10", ielts: "Band IELTS 9.0", percent: "Phần trăm" },
    label: "Thang điểm",
  },
  default_daily_words: {
    type: "int",
    min: 1,
    max: 50,
    label: "Số từ mới mỗi ngày",
    help: "Mặc định khi giao bộ từ cho lớp",
  },
  week_starts_on: {
    type: "int",
    min: 0,
    max: 6,
    label: "Tuần bắt đầu từ",
    help: "0 = Chủ nhật, 1 = Thứ hai",
  },
  join_code_ttl_days: {
    type: "int",
    min: 1,
    max: 365,
    label: "Hạn dùng mã lớp (ngày)",
  },
  join_code_max_uses: {
    type: "int",
    min: 1,
    max: 1000,
    label: "Số lượt dùng tối đa của mã lớp",
  },
};

/**
 * Validate một cấu hình.
 * Trả về { ok: true } hoặc { ok: false, error }.
 */
export function validateSetting(key, value) {
  const schema = SETTING_SCHEMA[key];
  if (!schema) {
    return { ok: false, error: `Cấu hình không tồn tại: ${key}` };
  }

  if (schema.type === "int") {
    if (!Number.isInteger(value)) {
      return { ok: false, error: `"${schema.label}" phải là số nguyên` };
    }
    if (value < schema.min || value > schema.max) {
      return {
        ok: false,
        error: `"${schema.label}" phải trong khoảng ${schema.min}–${schema.max}`,
      };
    }
    return { ok: true };
  }

  if (schema.type === "enum") {
    if (!schema.values.includes(value)) {
      return {
        ok: false,
        error: `"${schema.label}" phải là một trong: ${schema.values.join(", ")}`,
      };
    }
    return { ok: true };
  }

  if (schema.type === "time_array") {
    if (!Array.isArray(value)) {
      return { ok: false, error: `"${schema.label}" phải là danh sách` };
    }
    if (value.length === 0) {
      return { ok: false, error: `"${schema.label}" phải có ít nhất một giờ` };
    }
    if (value.length > schema.maxItems) {
      return { ok: false, error: `"${schema.label}" tối đa ${schema.maxItems} khung giờ` };
    }
    for (const t of value) {
      if (typeof t !== "string" || !TIME_RE.test(t)) {
        return { ok: false, error: `Giờ không hợp lệ: ${t} (định dạng HH:MM)` };
      }
    }
    return { ok: true };
  }

  return { ok: false, error: `Kiểu cấu hình không hỗ trợ: ${schema.type}` };
}

/**
 * Validate cả patch nhiều cấu hình.
 *
 * Nguyên tắc all-or-nothing: một key sai thì từ chối toàn bộ patch. Lưu nửa
 * vời sẽ để tổ chức ở trạng thái cấu hình không nhất quán.
 */
export function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: ["Dữ liệu cấu hình không hợp lệ"], valid: {} };
  }

  const entries = Object.entries(patch);
  if (entries.length === 0) {
    return { ok: false, errors: ["Không có cấu hình nào để lưu"], valid: {} };
  }

  const errors = [];
  const valid = {};

  for (const [key, value] of entries) {
    const r = validateSetting(key, value);
    if (r.ok) valid[key] = value;
    else errors.push(r.error);
  }

  // Ràng buộc liên quan giữa hai cấu hình: nếu active >= stalled thì không
  // bao giờ có học viên thuộc nhóm "chững lại" — cấu hình vô nghĩa.
  const active = valid.active_threshold_days;
  const stalled = valid.stalled_threshold_days;
  if (Number.isInteger(active) && Number.isInteger(stalled) && active >= stalled) {
    errors.push(
      "Ngưỡng 'đang học tốt' phải nhỏ hơn ngưỡng 'chững lại', nếu không sẽ không có nhóm chững lại"
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors, valid: {} };
  }
  return { ok: true, errors: [], valid };
}
