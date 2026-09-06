// Test quyền riêng tư cho API tiến độ lớp học.
//
// LỖ HỔNG ĐÃ PHÁT HIỆN (6/9/2026): API /api/classes/[id]/progress trả về
// TOÀN BỘ danh sách học viên kèm số liệu học tập (streak, số từ đã lưu,
// số ngày không hoạt động) cho BẤT KỲ AI truy cập được lớp — kể cả học
// viên khác trong cùng lớp.
//
// Vì sao nghiêm trọng: học viên A biết được học viên B đã bỏ học 20 ngày,
// hay học ít hơn mình. Đây là dữ liệu học tập cá nhân, không phải thông
// tin công khai của lớp. Với trẻ em (đối tượng chính của trung tâm Anh
// ngữ) thì càng nhạy cảm — dễ thành cớ so sánh, trêu chọc.
//
// Logic lọc tách ra lib để test được không cần DB.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterProgressForViewer } from "../../src/lib/progress-privacy.js";

const STUDENTS = [
  { membership_id: "m-self", words_saved: 100, streak_days: 5, state: "active" },
  { membership_id: "m-other1", words_saved: 20, streak_days: 0, state: "dropped" },
  { membership_id: "m-other2", words_saved: 50, streak_days: 2, state: "stalled" },
];

const SUMMARY = { active: 1, stalled: 1, dropped: 1, total: 3 };

describe("filterProgressForViewer — staff", () => {
  test("owner thấy TOÀN BỘ học viên", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "owner", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 3);
    assert.deepEqual(r.summary, SUMMARY);
  });

  test("teacher thấy TOÀN BỘ học viên", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "teacher", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 3);
  });
});

describe("filterProgressForViewer — học viên (ca bảo mật chính)", () => {
  test("học viên CHỈ thấy dữ liệu của chính mình", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "student", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 1, "học viên không được thấy bạn học");
    assert.equal(r.students[0].membership_id, "m-self");
  });

  test("học viên KHÔNG thấy số liệu bạn học dù chỉ là tổng hợp", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "student", viewerMembershipId: "m-self",
    });
    const ids = r.students.map((s) => s.membership_id);
    assert.ok(!ids.includes("m-other1"), "RÒ RỈ: thấy được học viên khác");
    assert.ok(!ids.includes("m-other2"), "RÒ RỈ: thấy được học viên khác");
  });

  test("summary của học viên phản ánh CHÍNH HỌ, không phải cả lớp", () => {
    // Nếu trả nguyên summary cả lớp thì học viên vẫn suy ra được "lớp có 1
    // bạn bỏ học" — vẫn là rò rỉ, chỉ ở dạng tổng hợp.
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "student", viewerMembershipId: "m-self",
    });
    assert.equal(r.summary.total, 1);
    assert.equal(r.summary.active, 1);
    assert.equal(r.summary.stalled, 0);
    assert.equal(r.summary.dropped, 0);
  });

  test("phụ huynh cũng chỉ thấy dữ liệu liên quan tới mình", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "parent", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 1);
  });

  test("học viên không có trong danh sách → nhận danh sách rỗng, không sập", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "student", viewerMembershipId: "m-khong-ton-tai",
    });
    assert.equal(r.students.length, 0);
    assert.equal(r.summary.total, 0);
  });

  test("viewerMembershipId null (chưa xác định) → không trả gì, fail-closed", () => {
    // An toàn mặc định: không biết người xem là ai thì KHÔNG cho xem gì,
    // thay vì cho xem tất cả.
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "student", viewerMembershipId: null,
    });
    assert.equal(r.students.length, 0);
  });

  test("role lạ/không xác định → xử lý như học viên (fail-closed)", () => {
    const r = filterProgressForViewer({
      students: STUDENTS, summary: SUMMARY, role: "unknown_role", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 1, "role lạ phải bị giới hạn, không được thấy hết");
  });

  test("danh sách rỗng không làm sập", () => {
    const r = filterProgressForViewer({
      students: [], summary: { active: 0, stalled: 0, dropped: 0, total: 0 },
      role: "student", viewerMembershipId: "m-self",
    });
    assert.equal(r.students.length, 0);
  });
});
