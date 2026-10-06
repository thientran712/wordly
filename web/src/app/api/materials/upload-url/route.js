// POST /api/materials/upload-url — xin signed URL để upload tài liệu.
//
// Luồng upload có 5 bước, tách ra để file KHÔNG đi qua server của mình
// (tránh nghẽn và tránh giới hạn body size của Vercel):
//
//   1. Client xin URL      → route này
//   2. Server kiểm quyền + quota
//   3. Server phát signed upload URL (hạn ngắn)
//   4. Client upload TRỰC TIẾP lên Storage
//   5. Client báo xong     → POST /api/materials (xác minh dung lượng thật)
//
// Quota được kiểm ở ĐÂY (bước 2) và xác minh lại ở bước 5. Không tin số
// client gửi lên — nếu tin, client sửa số là vượt quota tuỳ ý.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
// Logic kiểm tra nằm ở lib để test được không cần DB
// (tests/unit/material-validation.test.mjs — 20 ca, gồm path traversal).
import {
  safeFileName,
  validateMaterialSize,
  isAllowedMime,
} from "@/lib/material-validation";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { session_id, kind, file_name, mime_type, size_bytes } = body || {};

  if (!isUuid(session_id)) {
    return Response.json({ error: "session_id không hợp lệ" }, { status: 400 });
  }
  if (kind !== "document" && kind !== "audio") {
    return Response.json({ error: "kind phải là 'document' hoặc 'audio'" }, { status: 400 });
  }
  const sizeCheck = validateMaterialSize(kind, size_bytes);
  if (!sizeCheck.ok) {
    return Response.json({ error: sizeCheck.error }, { status: 400 });
  }
  if (!isAllowedMime(kind, mime_type)) {
    return Response.json({ error: `Định dạng không được hỗ trợ: ${mime_type}` }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ trả về session mà user được phép ghi (owner hoặc GV lớp đó).
  // Nếu không có quyền, query trả rỗng → 404.
  const { data: session, error: sessionErr } = await supabase
    .from("class_sessions")
    .select("id, class_id, org_id")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionErr) {
    console.error("[materials/upload-url] lỗi session:", sessionErr.message);
    return Response.json({ error: "Không kiểm tra được buổi học" }, { status: 500 });
  }
  if (!session) {
    return Response.json({ error: "Không tìm thấy buổi học" }, { status: 404 });
  }

  // Tính năng thư viện bài giảng có trong gói của trung tâm không?
  const featureBlock = await requireFeature(session.org_id, "lesson_library");
  if (featureBlock) return featureBlock;

  // Kiểm quota qua hàm SQL (dùng admin vì hàm là SECURITY DEFINER và
  // org_storage_usage chỉ cho đọc, không cho ghi từ client).
  const admin = createAdminClient();
  const { data: quota, error: quotaErr } = await admin.rpc("check_storage_quota", {
    p_org_id: session.org_id,
    p_bytes: size_bytes,
  });

  if (quotaErr) {
    console.error("[materials/upload-url] lỗi quota:", quotaErr.message);
    return Response.json({ error: "Không kiểm tra được dung lượng" }, { status: 500 });
  }

  if (!quota?.allowed) {
    const usedGb = (quota.bytes_used / 1024 ** 3).toFixed(2);
    const limitGb = (quota.bytes_limit / 1024 ** 3).toFixed(0);
    return Response.json(
      {
        error: `Đã dùng hết dung lượng lưu trữ (${usedGb}GB / ${limitGb}GB). Xoá tài liệu cũ hoặc nâng gói.`,
        quota_exceeded: true,
        bytes_used: quota.bytes_used,
        bytes_limit: quota.bytes_limit,
      },
      { status: 413 }
    );
  }

  // Đường dẫn: {org_id}/{class_id}/{session_id}/{uuid}-{tên}
  // org_id ở ĐẦU là điều kiện để Storage RLS so với JWT.
  const path = `${session.org_id}/${session.class_id}/${session.id}/${crypto.randomUUID()}-${safeFileName(file_name)}`;

  // createSignedUploadUrl cho phép client PUT thẳng lên Storage.
  const { data: signed, error: signErr } = await admin.storage
    .from("lesson-materials")
    .createSignedUploadUrl(path);

  if (signErr) {
    console.error("[materials/upload-url] lỗi signed URL:", signErr.message);
    return Response.json({ error: "Không tạo được link upload" }, { status: 500 });
  }

  return Response.json({
    upload_url: signed.signedUrl,
    token: signed.token,
    storage_path: path,
    quota: { bytes_used: quota.bytes_used, bytes_limit: quota.bytes_limit },
  });
}
