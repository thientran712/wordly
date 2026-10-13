// FCM HTTP v1: POST /v1/projects/<id>/messages:send — một request mỗi thiết bị.
// Không throw: mọi lỗi trả về { ok:false, status, code, message } để lượt cron
// quyết định xoá token / dừng lượt / bỏ qua.

export async function sendFcmMessage({ projectId, accessToken, message, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    return { ok: false, status: 0, code: "NETWORK", message: e.message };
  }
  if (res.ok) return { ok: true, status: res.status, code: null, message: "" };
  const body = await res.json().catch(() => ({}));
  const err = body.error || {};
  const fcmCode = (err.details || []).find((d) => d.errorCode)?.errorCode;
  return { ok: false, status: res.status, code: fcmCode || err.status || `HTTP_${res.status}`, message: err.message || "" };
}

/** Token không còn dùng được → xoá khỏi push_devices. INVALID_ARGUMENT chỉ
 * tính khi Google nói rõ là token — payload sai mà xoá token thì một lỗi code
 * sẽ xoá sạch thiết bị của mọi người. */
export function isDeadToken(r) {
  if (r.code === "UNREGISTERED" || r.code === "SENDER_ID_MISMATCH") return true;
  return r.code === "INVALID_ARGUMENT" && /registration token/i.test(r.message || "");
}

/** Lỗi cấu hình (service account, key APNs trên Firebase) → dừng cả lượt. */
export function isFatal(r) {
  if (r.code === "THIRD_PARTY_AUTH_ERROR" || r.status === 401) return true;
  return r.status === 403 && r.code !== "SENDER_ID_MISMATCH";
}
