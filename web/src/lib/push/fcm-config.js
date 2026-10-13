// Thiếu biến → null (push tắt, email không ảnh hưởng). Biến có nhưng hỏng →
// throw để lỗi cấu hình hiện rõ trong log cron, không im lặng.
export function loadFcmConfig(env = process.env) {
  const raw = env.FCM_SERVICE_ACCOUNT_BASE64;
  if (!raw) return null;
  let sa;
  try {
    sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_BASE64 không phải JSON service account hợp lệ");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("Service account FCM thiếu client_email/private_key");
  const projectId = env.FCM_PROJECT_ID || sa.project_id;
  if (!projectId) throw new Error("Thiếu FCM_PROJECT_ID");
  return { projectId, serviceAccount: sa };
}
