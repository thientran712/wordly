// Quan hệ phụ huynh–học viên — logic thuần, test được không cần DB.
// Xem tests/unit/guardian-links.test.mjs (16 ca).
//
// Logic này quyết định AI NHẬN EMAIL báo cáo học tập. Gửi sai người là rò rỉ
// thông tin học tập của trẻ cho người ngoài, nên ca "chỉ lấy phụ huynh của
// đúng học viên này" được test riêng.

// Quan hệ thường gặp ở trung tâm Anh ngữ Việt Nam.
export const GUARDIAN_RELATIONSHIPS = [
  "father",      // bố
  "mother",      // mẹ
  "grandparent", // ông/bà
  "sibling",     // anh/chị
  "other",       // người bảo hộ khác
];

export const RELATIONSHIP_LABELS = {
  father: "Bố",
  mother: "Mẹ",
  grandparent: "Ông/Bà",
  sibling: "Anh/Chị",
  other: "Người bảo hộ",
};

/**
 * Kiểm tra một liên kết phụ huynh–học viên trước khi lưu.
 * Trả về { ok: true } hoặc { ok: false, error }.
 */
export function validateGuardianLink(link) {
  if (!link || typeof link !== "object") {
    return { ok: false, error: "Thiếu thông tin liên kết" };
  }

  if (!GUARDIAN_RELATIONSHIPS.includes(link.relationship)) {
    return {
      ok: false,
      error: `Quan hệ không hợp lệ. Chọn: ${GUARDIAN_RELATIONSHIPS.join(", ")}`,
    };
  }

  // Chặn tự làm phụ huynh của chính mình: vô nghĩa về nghiệp vụ, và có thể
  // dùng để lách quyền (tự cấp cho mình quyền xem dữ liệu qua đường phụ huynh).
  const g = link.guardian_membership_id;
  const s = link.student_membership_id;
  if (g && s && g === s) {
    return { ok: false, error: "Không thể tự làm phụ huynh của chính mình" };
  }

  return { ok: true };
}

/**
 * Xác định danh sách email nhận báo cáo cho MỘT học viên.
 *
 * Thứ tự ưu tiên:
 *   1. Phụ huynh đã bật nhận báo cáo → gửi cho họ (có thể nhiều người)
 *   2. Không có phụ huynh nào bật → gửi cho chính học viên
 *      (trường hợp người lớn tự học, tự đóng tiền)
 *   3. Không có ai có email → không gửi
 *
 * Trả về { emails, reason } với reason = 'guardian' | 'self' | 'no_recipient'
 */
export function resolveReportRecipients(student, guardianLinks) {
  if (!student || typeof student !== "object") {
    return { emails: [], reason: "no_recipient" };
  }

  const links = Array.isArray(guardianLinks) ? guardianLinks : [];

  // CHỈ lấy phụ huynh của ĐÚNG học viên này. Lọc sai ở đây là gửi báo cáo
  // con A cho phụ huynh con B.
  const emails = [];
  const seen = new Set();

  for (const link of links) {
    if (link?.student_membership_id !== student.membership_id) continue;
    if (link.receive_reports !== true) continue;

    const email = typeof link.email === "string" ? link.email.trim() : "";
    if (!email) continue;

    // Bố mẹ có thể dùng chung một email — chỉ gửi một lần
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }

  if (emails.length > 0) {
    return { emails, reason: "guardian" };
  }

  // Không có phụ huynh nhận báo cáo → gửi cho chính học viên
  const own = typeof student.email === "string" ? student.email.trim() : "";
  if (own) {
    return { emails: [own], reason: "self" };
  }

  return { emails: [], reason: "no_recipient" };
}
