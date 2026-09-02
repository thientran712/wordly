// Kiểm tra tài liệu bài giảng — logic thuần, không phụ thuộc DB.
//
// Tách khỏi route handler để test được mà không cần database. Đây là logic
// BẢO MẬT nên bắt buộc có test (xem tests/unit/material-validation.test.mjs).

// Giới hạn theo loại. Bucket Storage đã chặn 100MB; đây là chặn nghiêm hơn
// theo nghiệp vụ và dùng chung cho cả UI (hiển thị giới hạn) lẫn server.
export const MAX_BYTES = {
  document: 50 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
};

export const ALLOWED_MIME = {
  document: [
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png", "image/jpeg", "image/gif", "image/webp",
  ],
  audio: ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"],
};

// Chỉ cho nhúng link từ nền tảng quen thuộc. Chặn link tuỳ ý để thư viện bài
// giảng không thành nơi phát tán link lạ cho học viên.
const ALLOWED_LINK_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com",
  "drive.google.com", "docs.google.com",
  "vimeo.com", "player.vimeo.com",
  "onedrive.live.com", "1drv.ms",
]);

/**
 * Làm sạch tên file trước khi đưa vào đường dẫn Storage.
 *
 * QUAN TRỌNG: tên file đi thẳng vào storage_path, nên phải chặn path
 * traversal ("../"). Lấy phần sau dấu phân cách cuối cùng xử lý luôn cả
 * "../" lẫn thư mục lồng nhau.
 */
export function safeFileName(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "file";

  // Chỉ giữ đoạn sau dấu phân cách cuối — loại bỏ mọi cấp thư mục và "..".
  const base = raw.split(/[/\\]/).pop() || "";

  const cleaned = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // bỏ dấu tiếng Việt
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")            // không mở đầu bằng '.' (file ẩn) hoặc '-'
    .slice(0, 120);

  return cleaned || "file";
}

/** Link ngoài có thuộc nền tảng được phép và dùng https không? */
export function isAllowedLink(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const u = new URL(url);
    // Chặn javascript:, data:, http: — chỉ https mới được nhúng
    if (u.protocol !== "https:") return false;
    // So khớp CHÍNH XÁC hostname, không dùng endsWith, để
    // "youtube.com.evil.com" không lọt qua
    return ALLOWED_LINK_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Kiểm dung lượng theo loại tài liệu.
 * Trả về { ok: true } hoặc { ok: false, error } để route trả thẳng cho client.
 */
export function validateMaterialSize(kind, sizeBytes) {
  const limit = MAX_BYTES[kind];
  if (!limit) {
    return { ok: false, error: `Loại tài liệu không hỗ trợ: ${kind}` };
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "Dung lượng file không hợp lệ" };
  }
  if (sizeBytes > limit) {
    const mb = Math.floor(limit / 1024 / 1024);
    return { ok: false, error: `File vượt giới hạn ${mb}MB` };
  }
  return { ok: true };
}

/** MIME có được phép với loại này không? */
export function isAllowedMime(kind, mimeType) {
  return (ALLOWED_MIME[kind] || []).includes(mimeType);
}
