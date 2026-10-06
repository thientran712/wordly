// Kiểm tra danh sách mời thành viên — logic thuần, test được không cần DB.
// Xem tests/unit/invite-validation.test.mjs

export const ORG_ROLES = ["owner", "teacher", "student", "parent"];

// Giới hạn mỗi lần gọi API: mời quá nhiều một lượt sẽ làm request chậm và
// dễ bị lạm dụng để gửi thư rác qua hệ thống của mình.
export const MAX_INVITES_PER_REQUEST = 100;

// Độ dài tối đa của email theo RFC 5321 là 254 ký tự.
const MAX_EMAIL_LENGTH = 254;

// Cố tình dùng regex đơn giản: xác thực email thật sự chỉ có thể làm bằng
// cách gửi thư. Regex phức tạp hơn chỉ tạo cảm giác an toàn giả.
const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;

export function isValidOrgRole(role) {
  return typeof role === "string" && ORG_ROLES.includes(role);
}

/**
 * Chuẩn hoá danh sách email cần mời.
 *
 * Nhận mảng, hoặc chuỗi nhiều email cách nhau bởi dấu phẩy / chấm phẩy /
 * xuống dòng (người dùng thường dán từ Excel).
 *
 * Trả về { emails, invalid, truncated } — `invalid` để báo lại cho người
 * dùng biết dòng nào sai, không bỏ im lặng.
 */
export function parseInviteList(input) {
  let raw = [];

  if (Array.isArray(input)) {
    raw = input;
  } else if (typeof input === "string") {
    raw = input.split(/[,;\n\r]+/);
  }

  const emails = [];
  const invalid = [];
  const seen = new Set();

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();

    if (lower.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(lower)) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(lower)) continue;

    seen.add(lower);
    emails.push(lower);
  }

  const truncated = emails.length > MAX_INVITES_PER_REQUEST;

  return {
    emails: truncated ? emails.slice(0, MAX_INVITES_PER_REQUEST) : emails,
    invalid,
    truncated,
  };
}
