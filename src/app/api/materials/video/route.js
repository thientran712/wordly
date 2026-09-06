// POST /api/materials/video — đăng ký video sau khi đã upload lên R2.
//
// Cùng nguyên tắc bảo mật như /api/materials (tài liệu): KHÔNG tin dung
// lượng client gửi — xác minh lại bằng HeadObject trên R2 trước khi ghi DB.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { verifyUploadedObject, deleteObject } from "@/lib/r2-client";
import { VIDEO_MAX_BYTES } from "@/lib/video-validation";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { session_id, title, description, video_key, duration_seconds, allow_download } = body || {};

  if (!isUuid(session_id)) {
    return Response.json({ error: "session_id không hợp lệ" }, { status: 400 });
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  if (typeof video_key !== "string" || !video_key.trim()) {
    return Response.json({ error: "video_key không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, class_id, org_id")
    .eq("id", session_id)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: "Không tìm thấy buổi học" }, { status: 404 });
  }

  // Key phải bắt đầu bằng org_id của CHÍNH session này — chặn đăng ký video
  // đã upload cho org khác (dù key được ký riêng cho từng lượt upload, đây
  // là lớp phòng thủ thứ hai nếu có sai sót ở chỗ khác).
  if (!video_key.startsWith(`${session.org_id}/`)) {
    return Response.json({ error: "video_key không khớp với buổi học" }, { status: 400 });
  }

  // XÁC MINH file thật sự tồn tại trên R2 và lấy dung lượng THẬT.
  // Không tin size client gửi ở bước upload-url — giữa lúc ký URL và lúc
  // đăng ký, client có thể gửi bất cứ dung lượng nào lên R2.
  let verified;
  try {
    verified = await verifyUploadedObject(video_key);
  } catch (e) {
    console.error("[materials/video] lỗi xác minh R2:", e.message);
    return Response.json({ error: "Không xác minh được file trên R2" }, { status: 500 });
  }

  if (!verified.exists) {
    return Response.json(
      { error: "Chưa thấy video trên hệ thống. Hãy upload trước khi đăng ký." },
      { status: 409 }
    );
  }

  if (!Number.isFinite(verified.sizeBytes) || verified.sizeBytes <= 0) {
    return Response.json({ error: "Không đọc được dung lượng video" }, { status: 500 });
  }

  // Chặn lại LẦN NỮA bằng dung lượng THẬT — client có thể đã upload file
  // lớn hơn số khai báo lúc xin URL (R2 signed PUT không giới hạn size).
  if (verified.sizeBytes > VIDEO_MAX_BYTES) {
    await deleteObject(video_key).catch((e) =>
      console.error("[materials/video] không dọn được file vượt giới hạn:", e.message)
    );
    return Response.json(
      { error: `Video vượt giới hạn dung lượng (${(VIDEO_MAX_BYTES / 1024 ** 3).toFixed(1)}GB)` },
      { status: 413 }
    );
  }

  const admin = createAdminClient();

  // Kiểm quota LẦN NỮA với dung lượng thật — giữa lúc xin URL và lúc đăng
  // ký, org có thể đã upload video khác và vượt hạn mức.
  const { data: quota } = await admin.rpc("check_video_quota", {
    p_org_id: session.org_id,
    p_bytes: verified.sizeBytes,
  });

  if (!quota?.allowed) {
    await deleteObject(video_key).catch((e) =>
      console.error("[materials/video] không dọn được file vượt quota:", e.message)
    );
    return Response.json(
      { error: "Đã dùng hết dung lượng lưu trữ video", quota_exceeded: true },
      { status: 413 }
    );
  }

  // Trigger enforce_material_tenant tự điền class_id/org_id từ session,
  // và track_video_usage tự cộng bytes_used vào org_video_usage.
  const { data: created, error: insertErr } = await supabase
    .from("lesson_materials")
    .insert({
      session_id,
      class_id: session.class_id,
      org_id: session.org_id,
      kind: "video",
      title: cleanTitle,
      description: description?.trim() || null,
      provider: "r2",
      provider_id: video_key,
      size_bytes: verified.sizeBytes,
      mime_type: verified.contentType,
      duration_seconds: Number.isFinite(duration_seconds) && duration_seconds > 0
        ? Math.round(duration_seconds) : null,
      allow_download: allow_download === true, // mặc định FALSE cho video (khác tài liệu) — tránh phát tán ngoài ý muốn
      uploaded_by: user.id,
    })
    .select("id, kind, title, description, size_bytes, duration_seconds, allow_download, created_at")
    .single();

  if (insertErr) {
    console.error("[materials/video] lỗi insert:", insertErr.message);
    await deleteObject(video_key).catch((e) =>
      console.error("[materials/video] không dọn được file mồ côi:", e.message)
    );
    return Response.json({ error: "Không lưu được video" }, { status: 500 });
  }

  return Response.json({ material: created }, { status: 201 });
}
