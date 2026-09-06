// Validation video upload lên Cloudflare R2 — logic thuần, không phụ thuộc DB.
// Xem tests/unit/video-validation.test.mjs.
//
// VÌ SAO R2 (không phải Supabase Storage): R2 free tier cho 10GB lưu trữ VÀ
// KHÔNG TÍNH PHÍ băng thông tải ra (egress) — khác Supabase/S3 tính phí
// egress theo GB. Video xem nhiều lần đốt băng thông rất nhanh (20 HV xem
// 2 lần/tháng = 10.5GB), nên egress-free là điều kiện để "miễn phí" đúng
// nghĩa ở quy mô này.
//
// GIỚI HẠN QUAN TRỌNG: 10GB free là CỐ ĐỊNH cho TOÀN HỆ THỐNG, không phải
// mỗi org 10GB riêng. Một trung tâm dùng hết sẽ ảnh hưởng các trung tâm
// khác — xem isNearSystemCap().

// Giới hạn theo file. 2GB đủ cho ~50-70 phút video 720p nén tốt; đặt trần
// để một file lớn không nuốt hết quota hệ thống trong một lượt upload.
export const VIDEO_MAX_BYTES = 2 * 1024 ** 3; // 2GB
export const VIDEO_MAX_SECONDS = 90 * 60; // 90 phút — dư cho buổi học dài nhất

// Danh sách TRẮNG định dạng — an toàn hơn danh sách đen. mkv/avi loại vì
// nhiều trình duyệt không phát trực tiếp được, sẽ gây trải nghiệm tệ.
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"];

// Trần free tier của Cloudflare R2 (10GB). Cảnh báo sớm ở 80% để có thời
// gian quyết định nâng gói trả phí ($0.015/GB/tháng, rất rẻ) trước khi
// upload thật sự bị từ chối.
export const SYSTEM_CAP_BYTES = 10 * 1024 ** 3;
const WARNING_THRESHOLD = 0.8;

/**
 * Kiểm một video trước khi cấp quyền upload.
 * Trả về { ok: true } hoặc { ok: false, error }.
 */
export function validateVideoUpload(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Thiếu thông tin video" };
  }

  const { mime_type, size_bytes, duration_seconds } = input;

  if (!ALLOWED_VIDEO_MIME.includes(mime_type)) {
    return {
      ok: false,
      error: `Định dạng không được hỗ trợ. Chỉ nhận: ${ALLOWED_VIDEO_MIME.join(", ")}`,
    };
  }

  if (!Number.isInteger(size_bytes) || size_bytes <= 0) {
    return { ok: false, error: "Dung lượng file không hợp lệ" };
  }
  if (size_bytes > VIDEO_MAX_BYTES) {
    const gb = (VIDEO_MAX_BYTES / 1024 ** 3).toFixed(1);
    return { ok: false, error: `Video vượt giới hạn dung lượng (${gb}GB)` };
  }

  if (!Number.isFinite(duration_seconds) || duration_seconds <= 0) {
    return { ok: false, error: "Thời lượng video không hợp lệ" };
  }
  if (duration_seconds > VIDEO_MAX_SECONDS) {
    const mins = Math.floor(VIDEO_MAX_SECONDS / 60);
    return { ok: false, error: `Video vượt giới hạn thời lượng (${mins} phút)` };
  }

  return { ok: true };
}

/**
 * Đường dẫn object trong R2: {org_id}/{class_id}/{session_id}/{uuid}.mp4
 *
 * org_id ở ĐẦU để dễ audit và dọn theo từng org khi cần (không có Storage
 * RLS như Supabase — R2 không biết gì về org, nên đường dẫn là cơ chế
 * TỔ CHỨC dữ liệu, không phải cơ chế PHÂN QUYỀN. Quyền truy cập thật nằm
 * ở việc server ký URL, không phải ở cấu trúc path).
 */
export function buildVideoKey({ orgId, classId, sessionId }) {
  const safe = (s) => String(s ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  return `${safe(orgId)}/${safe(classId)}/${safe(sessionId)}/${crypto.randomUUID()}.mp4`;
}

/**
 * Tổng dung lượng video hệ thống đã gần chạm trần free tier chưa?
 * Dùng để quyết định có ghi log cảnh báo hay không.
 */
export function isNearSystemCap(totalBytesUsed) {
  if (!Number.isFinite(totalBytesUsed) || totalBytesUsed <= 0) return false;
  return totalBytesUsed >= SYSTEM_CAP_BYTES * WARNING_THRESHOLD;
}
