// Kiểm tra ảnh chụp để dịch — logic thuần, không phụ thuộc AI/DB, test được
// không cần network. Cùng quy ước với material-validation.js: chặn ở SERVER,
// không tin kích thước/mime client báo.

import { parseJsonResponse } from "../ai/ai-models.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB — ảnh chụp chữ không cần lớn hơn
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB — ghi âm 1 câu ngắn, dự phòng khi không có Web Speech API
export const ALLOWED_AUDIO_MIME = ["audio/webm", "audio/mp4", "audio/wav", "audio/ogg"];

/**
 * Kiểm tra một ảnh base64 data URL (`data:image/jpeg;base64,...`) trước khi
 * gửi cho AI. Trả về { error: string | null }.
 */
export function validateImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return { error: "Ảnh không hợp lệ" };
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return { error: "Ảnh không hợp lệ" };

  const [, mime, base64] = match;
  if (!ALLOWED_IMAGE_MIME.includes(mime)) {
    return { error: `Định dạng ảnh không hỗ trợ: ${mime}` };
  }

  // Base64 ~ 4/3 kích thước thật — tính ngược lại để chặn ảnh quá lớn
  // trước khi phải decode (decode base64 lớn tốn CPU không cần thiết).
  const approxBytes = Math.ceil((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return { error: `Ảnh quá lớn (tối đa ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB)` };
  }

  return { error: null };
}

/**
 * Parse phản hồi AI cho OCR+dịch ảnh (prompt yêu cầu JSON
 * { source_text, translated_text }). Không throw — luôn trả về
 * { source_text, translated_text, error }, error null khi thành công.
 */
export function parseImageTranslateResponse(content) {
  const data = parseJsonResponse(content);
  if (!data) {
    return { source_text: null, translated_text: null, error: "Không đọc được phản hồi AI" };
  }

  const { source_text, translated_text } = data;
  if (typeof source_text !== "string" || typeof translated_text !== "string") {
    return { source_text: null, translated_text: null, error: "Phản hồi AI thiếu dữ liệu" };
  }

  if (!source_text.trim()) {
    return { source_text: "", translated_text: "", error: "Không tìm thấy chữ trong ảnh" };
  }

  return { source_text, translated_text, error: null };
}

/**
 * Kiểm tra file audio ghi âm trước khi gửi cho Whisper (chỉ dùng khi browser
 * không hỗ trợ Web Speech API). Nhận một File/Blob (có `.type`/`.size`).
 * Trả về { error: string | null }.
 */
export function validateVoiceUpload(file) {
  if (!file || typeof file !== "object" || typeof file.size !== "number" || typeof file.type !== "string") {
    return { error: "File âm thanh không hợp lệ" };
  }

  if (!ALLOWED_AUDIO_MIME.includes(file.type)) {
    return { error: `Định dạng âm thanh không hỗ trợ: ${file.type}` };
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return { error: `File âm thanh quá lớn (tối đa ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` };
  }

  return { error: null };
}
