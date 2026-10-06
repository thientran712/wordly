// Lọc dữ liệu tiến độ theo người xem — logic thuần, test được không cần DB.
// Xem tests/unit/progress-privacy.test.mjs (11 ca).
//
// VÌ SAO CÓ FILE NÀY: API /api/classes/[id]/progress trước đây trả TOÀN BỘ
// danh sách học viên kèm số liệu học tập cho bất kỳ ai truy cập được lớp —
// kể cả học viên khác. Nghĩa là học viên A biết được B đã bỏ học 20 ngày,
// hay học ít hơn mình.
//
// Với trung tâm Anh ngữ (đối tượng chính là trẻ em) thì càng nhạy cảm:
// dữ liệu này dễ thành cớ so sánh, trêu chọc. Đây là dữ liệu học tập cá
// nhân, không phải thông tin công khai của lớp.
//
// Nguyên tắc: FAIL-CLOSED — không xác định được người xem thì không trả gì,
// role lạ thì xử lý như học viên (hạn chế nhất).

const STAFF_ROLES = new Set(["owner", "teacher"]);

/**
 * Lọc danh sách học viên + tính lại summary theo quyền của người xem.
 *
 * @param students             mảng học viên đã tính sẵn (có membership_id, state)
 * @param summary              tổng hợp cả lớp { active, stalled, dropped, total }
 * @param role                 vai trò người xem trong org
 * @param viewerMembershipId   membership của chính người xem trong lớp này
 */
export function filterProgressForViewer({ students, summary, role, viewerMembershipId }) {
  const list = Array.isArray(students) ? students : [];

  // Staff xem được toàn lớp — đó là công việc của họ.
  if (STAFF_ROLES.has(role)) {
    return { students: list, summary };
  }

  // Không xác định được người xem là ai → không trả gì. Thà hiện màn hình
  // trống còn hơn lộ dữ liệu người khác.
  if (!viewerMembershipId) {
    return { students: [], summary: emptySummary() };
  }

  const own = list.filter((s) => s.membership_id === viewerMembershipId);

  // Tính LẠI summary chỉ từ dữ liệu của chính họ — nếu trả nguyên summary
  // cả lớp thì học viên vẫn suy ra được "lớp có 1 bạn bỏ học", vẫn là rò rỉ
  // dù ở dạng tổng hợp.
  const ownSummary = emptySummary();
  for (const s of own) {
    if (s.state && ownSummary[s.state] !== undefined) ownSummary[s.state] += 1;
    ownSummary.total += 1;
  }

  return { students: own, summary: ownSummary };
}

function emptySummary() {
  return { active: 0, stalled: 0, dropped: 0, total: 0 };
}
