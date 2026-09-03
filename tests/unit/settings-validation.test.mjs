// Test cho validate cấu hình tổ chức.
//
// Cấu hình sai kiểu làm hỏng nghiệp vụ âm thầm: active_threshold_days = "abc"
// khiến dashboard phân loại sai; join_code_ttl_days = 0 khiến mã lớp hết hạn
// ngay. Nên phải validate theo từng key, không chỉ nhận bừa.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateSetting,
  validateSettingsPatch,
  SETTING_SCHEMA,
} from "../../src/lib/settings-validation.js";

describe("validateSetting — ngưỡng ngày", () => {
  test("nhận số nguyên trong khoảng", () => {
    assert.equal(validateSetting("active_threshold_days", 3).ok, true);
    assert.equal(validateSetting("stalled_threshold_days", 14).ok, true);
  });

  test("từ chối số 0 và số âm", () => {
    assert.equal(validateSetting("active_threshold_days", 0).ok, false);
    assert.equal(validateSetting("active_threshold_days", -1).ok, false);
  });

  test("từ chối số quá lớn", () => {
    assert.equal(validateSetting("active_threshold_days", 5000).ok, false);
  });

  test("từ chối chuỗi và số thập phân", () => {
    assert.equal(validateSetting("active_threshold_days", "3").ok, false);
    assert.equal(validateSetting("active_threshold_days", 3.5).ok, false);
  });
});

describe("validateSetting — grading_scale", () => {
  test("nhận giá trị trong danh sách cho phép", () => {
    for (const v of ["ten", "ielts", "percent"]) {
      assert.equal(validateSetting("grading_scale", v).ok, true, v);
    }
  });

  test("từ chối giá trị lạ", () => {
    assert.equal(validateSetting("grading_scale", "thang-100").ok, false);
    assert.equal(validateSetting("grading_scale", "TEN").ok, false);
  });
});

describe("validateSetting — default_email_times", () => {
  test("nhận mảng giờ HH:MM hợp lệ", () => {
    assert.equal(validateSetting("default_email_times", ["08:00"]).ok, true);
    assert.equal(validateSetting("default_email_times", ["07:30", "20:00"]).ok, true);
  });

  test("từ chối giờ sai định dạng", () => {
    assert.equal(validateSetting("default_email_times", ["8h"]).ok, false);
    assert.equal(validateSetting("default_email_times", ["25:00"]).ok, false);
    assert.equal(validateSetting("default_email_times", ["08:70"]).ok, false);
  });

  test("từ chối mảng rỗng — phải có ít nhất một giờ gửi", () => {
    assert.equal(validateSetting("default_email_times", []).ok, false);
  });

  test("từ chối quá nhiều khung giờ", () => {
    const many = Array.from({ length: 15 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
    assert.equal(validateSetting("default_email_times", many).ok, false);
  });

  test("từ chối không phải mảng", () => {
    assert.equal(validateSetting("default_email_times", "08:00").ok, false);
  });
});

describe("validateSetting — week_starts_on", () => {
  test("nhận 0 (CN) và 1 (T2)", () => {
    assert.equal(validateSetting("week_starts_on", 0).ok, true);
    assert.equal(validateSetting("week_starts_on", 1).ok, true);
  });

  test("từ chối giá trị ngoài 0-6", () => {
    assert.equal(validateSetting("week_starts_on", 7).ok, false);
    assert.equal(validateSetting("week_starts_on", -1).ok, false);
  });
});

describe("validateSetting — key không tồn tại", () => {
  test("từ chối key lạ thay vì lưu bừa", () => {
    const r = validateSetting("khong_ton_tai", 123);
    assert.equal(r.ok, false);
    assert.match(r.error, /không tồn tại|không hỗ trợ/i);
  });
});

describe("validateSettingsPatch", () => {
  test("nhận patch nhiều key hợp lệ", () => {
    const r = validateSettingsPatch({
      active_threshold_days: 2,
      grading_scale: "ielts",
    });
    assert.equal(r.ok, true);
    assert.equal(Object.keys(r.valid).length, 2);
  });

  test("báo lỗi từng key sai, không bỏ im lặng", () => {
    const r = validateSettingsPatch({
      active_threshold_days: "sai",
      grading_scale: "lạ",
    });
    assert.equal(r.ok, false);
    assert.equal(r.errors.length, 2);
  });

  test("một key sai làm cả patch bị từ chối", () => {
    // Nguyên tắc: hoặc lưu hết, hoặc không lưu gì — tránh trạng thái nửa vời
    const r = validateSettingsPatch({
      active_threshold_days: 3,
      grading_scale: "sai",
    });
    assert.equal(r.ok, false);
  });

  test("patch rỗng bị từ chối", () => {
    assert.equal(validateSettingsPatch({}).ok, false);
    assert.equal(validateSettingsPatch(null).ok, false);
  });

  test("ngưỡng 'đang học' phải nhỏ hơn ngưỡng 'chững lại'", () => {
    // Nếu active >= stalled thì không bao giờ có học viên nhóm "chững lại"
    const bad = validateSettingsPatch({
      active_threshold_days: 10,
      stalled_threshold_days: 5,
    });
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(" "), /nhỏ hơn/i);

    const good = validateSettingsPatch({
      active_threshold_days: 3,
      stalled_threshold_days: 7,
    });
    assert.equal(good.ok, true);
  });

  test("SETTING_SCHEMA công khai cho UI dựng form", () => {
    assert.ok(SETTING_SCHEMA.active_threshold_days);
    assert.equal(SETTING_SCHEMA.grading_scale.type, "enum");
    assert.ok(Array.isArray(SETTING_SCHEMA.grading_scale.values));
  });
});
