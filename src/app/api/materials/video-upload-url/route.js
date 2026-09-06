// POST /api/materials/video-upload-url — xin signed URL để upload video lên R2.
//
// Cùng luồng 2 bước như /api/materials/upload-url (tài liệu Supabase Storage),
// khác nơi lưu blob:
//   1. Client xin URL      → route này (kiểm quyền + quota 2 lớp)
//   2. Client PUT trực tiếp lên R2 (không qua server Vercel)
//   3. Client báo xong     → POST /api/materials/video (xác minh dung lượng thật)

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import { validateVideoUpload, buildVideoKey, isNearSystemCap } from "@/lib/video-validation";
import { createSignedUploadUrl } from "@/lib/r2-client";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { session_id, mime_type, size_bytes, duration_seconds } = body || {};

  if (!isUuid(session_id)) {
    return Response.json({ error: "session_id không hợp lệ" }, { status: 400 });
  }

  const check = validateVideoUpload({ mime_type, size_bytes, duration_seconds });
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ trả về session mà user được phép ghi (owner hoặc GV lớp đó)
  const { data: session, error: sessionErr } = await supabase
    .from("class_sessions")
    .select("id, class_id, org_id")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionErr) {
    console.error("[materials/video-upload-url] lỗi session:", sessionErr.message);
    return Response.json({ error: "Không kiểm tra được buổi học" }, { status: 500 });
  }
  if (!session) {
    return Response.json({ error: "Không tìm thấy buổi học" }, { status: 404 });
  }

  const featureBlock = await requireFeature(session.org_id, "video_upload");
  if (featureBlock) return featureBlock;

  // Kiểm quota 2 lớp: hạn mức riêng của org VÀ trần chung hệ thống (R2 free
  // tier 10GB là CỐ ĐỊNH cho toàn hệ thống, không phải mỗi org riêng).
  const admin = createAdminClient();
  const { data: quota, error: quotaErr } = await admin.rpc("check_video_quota", {
    p_org_id: session.org_id,
    p_bytes: size_bytes,
  });

  if (quotaErr) {
    console.error("[materials/video-upload-url] lỗi quota:", quotaErr.message);
    return Response.json({ error: "Không kiểm tra được dung lượng" }, { status: 500 });
  }

  if (!quota?.allowed) {
    // Phân biệt 2 lý do từ chối để thông báo đúng — quan trọng vì org đã
    // hết hạn mức riêng khác hẳn hệ thống đã hết quota free tier (owner
    // không tự nâng gói được ở trường hợp sau, cần chủ dự án can thiệp).
    const orgFull = quota.org_bytes_used + size_bytes > quota.org_bytes_limit;
    const message = orgFull
      ? `Đã dùng hết hạn mức video của trung tâm (${(quota.org_bytes_used / 1024 ** 3).toFixed(2)}GB / ${(quota.org_bytes_limit / 1024 ** 3).toFixed(1)}GB). Xoá video cũ hoặc liên hệ nâng gói.`
      : "Hệ thống đã đạt giới hạn lưu trữ video miễn phí. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.";

    return Response.json(
      { error: message, quota_exceeded: true, quota },
      { status: 413 }
    );
  }

  // Cảnh báo sớm khi hệ thống gần chạm trần free tier — chỉ ghi log, không
  // chặn upload này (upload đã qua kiểm quota ở trên).
  if (isNearSystemCap(quota.system_bytes_used + size_bytes)) {
    console.warn(
      `[video-quota] Hệ thống gần chạm trần R2 free tier: ` +
      `${((quota.system_bytes_used + size_bytes) / 1024 ** 3).toFixed(2)}GB / 10GB`
    );
  }

  const key = buildVideoKey({ orgId: session.org_id, classId: session.class_id, sessionId: session.id });

  let uploadUrl;
  try {
    uploadUrl = await createSignedUploadUrl(key, mime_type);
  } catch (e) {
    console.error("[materials/video-upload-url] lỗi tạo signed URL:", e.message);
    return Response.json({ error: "Không tạo được link upload. Kiểm tra cấu hình R2." }, { status: 500 });
  }

  return Response.json({
    upload_url: uploadUrl,
    video_key: key,
    quota: { org_bytes_used: quota.org_bytes_used, org_bytes_limit: quota.org_bytes_limit },
  });
}
