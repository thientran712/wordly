// Test cho logic quan hệ phụ huynh–học viên.
//
// Nghiệp vụ thật ở trung tâm Anh ngữ Việt Nam:
//   • Một phụ huynh có thể có NHIỀU con cùng học (2-3 em là bình thường)
//   • Một học viên có thể có NHIỀU người nhận báo cáo (bố + mẹ)
//   • Học viên người lớn (tự đóng tiền) thì KHÔNG có phụ huynh — báo cáo gửi
//     cho chính họ
//
// Logic này quyết định AI NHẬN EMAIL báo cáo. Gửi sai người là rò rỉ thông
// tin học tập của trẻ cho người ngoài — phải test kỹ.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveReportRecipients,
  validateGuardianLink,
  GUARDIAN_RELATIONSHIPS,
} from "../../src/lib/guardian-links.js";

describe("validateGuardianLink", () => {
  test("nhận quan hệ hợp lệ", () => {
    for (const r of GUARDIAN_RELATIONSHIPS) {
      assert.equal(validateGuardianLink({ relationship: r }).ok, true, r);
    }
  });

  test("từ chối quan hệ lạ", () => {
    assert.equal(validateGuardianLink({ relationship: "bạn bè" }).ok, false);
    assert.equal(validateGuardianLink({ relationship: "" }).ok, false);
    assert.equal(validateGuardianLink({}).ok, false);
  });

  test("từ chối tự làm phụ huynh của chính mình", () => {
    // Vòng lặp vô nghĩa, và có thể dùng để lách quyền xem dữ liệu
    const r = validateGuardianLink({
      relationship: "father",
      guardian_membership_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      student_membership_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /chính mình|chính bản thân/i);
  });

  test("cho phép khi hai id khác nhau", () => {
    const r = validateGuardianLink({
      relationship: "mother",
      guardian_membership_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      student_membership_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    });
    assert.equal(r.ok, true);
  });
});

describe("resolveReportRecipients", () => {
  const student = { membership_id: "s1", email: "hocvien@x.com", role: "student" };

  test("có phụ huynh → gửi CHO PHỤ HUYNH, không gửi cho học viên", () => {
    const guardians = [{ student_membership_id: "s1", email: "bo@x.com", receive_reports: true }];
    const r = resolveReportRecipients(student, guardians);
    assert.deepEqual(r.emails, ["bo@x.com"]);
    assert.equal(r.reason, "guardian");
  });

  test("nhiều phụ huynh (bố + mẹ) → gửi cả hai", () => {
    const guardians = [
      { student_membership_id: "s1", email: "bo@x.com", receive_reports: true },
      { student_membership_id: "s1", email: "me@x.com", receive_reports: true },
    ];
    const r = resolveReportRecipients(student, guardians);
    assert.equal(r.emails.length, 2);
    assert.ok(r.emails.includes("bo@x.com") && r.emails.includes("me@x.com"));
  });

  test("phụ huynh TẮT nhận báo cáo → không gửi cho người đó", () => {
    const guardians = [
      { student_membership_id: "s1", email: "bo@x.com", receive_reports: true },
      { student_membership_id: "s1", email: "me@x.com", receive_reports: false },
    ];
    const r = resolveReportRecipients(student, guardians);
    assert.deepEqual(r.emails, ["bo@x.com"]);
  });

  test("KHÔNG có phụ huynh → gửi cho chính học viên (người lớn tự học)", () => {
    const r = resolveReportRecipients(student, []);
    assert.deepEqual(r.emails, ["hocvien@x.com"]);
    assert.equal(r.reason, "self");
  });

  test("có phụ huynh nhưng tất cả đều tắt → gửi cho học viên", () => {
    const guardians = [{ student_membership_id: "s1", email: "bo@x.com", receive_reports: false }];
    const r = resolveReportRecipients(student, guardians);
    assert.deepEqual(r.emails, ["hocvien@x.com"]);
    assert.equal(r.reason, "self");
  });

  test("CHỈ lấy phụ huynh của ĐÚNG học viên này", () => {
    // Ca quan trọng nhất: gửi báo cáo con A cho phụ huynh con B là rò rỉ
    const guardians = [
      { student_membership_id: "s1", email: "bo-cua-s1@x.com", receive_reports: true },
      { student_membership_id: "s2", email: "bo-cua-s2@x.com", receive_reports: true },
    ];
    const r = resolveReportRecipients(student, guardians);
    assert.deepEqual(r.emails, ["bo-cua-s1@x.com"]);
    assert.ok(!r.emails.includes("bo-cua-s2@x.com"), "RÒ RỈ: gửi cho phụ huynh học viên khác");
  });

  test("loại email trùng (bố mẹ dùng chung email)", () => {
    const guardians = [
      { student_membership_id: "s1", email: "giadinh@x.com", receive_reports: true },
      { student_membership_id: "s1", email: "GiaDinh@x.com", receive_reports: true },
    ];
    const r = resolveReportRecipients(student, guardians);
    assert.equal(r.emails.length, 1, "email trùng phải bị loại");
  });

  test("bỏ qua phụ huynh không có email", () => {
    const guardians = [
      { student_membership_id: "s1", email: null, receive_reports: true },
      { student_membership_id: "s1", email: "me@x.com", receive_reports: true },
    ];
    const r = resolveReportRecipients(student, guardians);
    assert.deepEqual(r.emails, ["me@x.com"]);
  });

  test("học viên không email + không phụ huynh → không gửi ai", () => {
    const r = resolveReportRecipients({ membership_id: "s1", email: null }, []);
    assert.deepEqual(r.emails, []);
    assert.equal(r.reason, "no_recipient");
  });

  test("đầu vào không hợp lệ không làm sập", () => {
    assert.deepEqual(resolveReportRecipients(null, null).emails, []);
    assert.deepEqual(resolveReportRecipients(student, "sai kiểu").emails, ["hocvien@x.com"]);
  });
});
