// POST /api/speaking/[id]/submit — học viên nộp bài nói
//
// Luồng 2 bước như upload tài liệu: xin signed URL → upload trực tiếp lên
// Storage → đăng ký. Body ở đây là bước đăng ký (audio đã upload xong).
//
// Truyền ?action=upload-url để lấy signed URL trước.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";

const ALLOWED_MIME = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"];
const MAX_BYTES = 15 * 1024 * 1024; // 15MB — dư cho 5 phút audio nén
// Audio bài nói được giữ 90 ngày sau khi chấm, rồi job dọn xoá (giữ lại điểm)
const AUDIO_RETENTION_DAYS = 90;

export async function POST(request, { params }) {
  const { id: promptId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(promptId)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: HV chỉ đọc được đề đã published trong lớp mình
  const { data: prompt } = await supabase
    .from("speaking_prompts")
    .select("id, class_id, org_id, max_seconds, due_at, status")
    .eq("id", promptId)
    .maybeSingle();

  if (!prompt) return Response.json({ error: "Không tìm thấy đề nói" }, { status: 404 });
  if (prompt.status === "draft") {
    return Response.json({ error: "Đề chưa được mở" }, { status: 409 });
  }
  if (prompt.status === "closed") {
    return Response.json({ error: "Đề đã đóng" }, { status: 409 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", prompt.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Bạn không thuộc trung tâm này" }, { status: 403 });
  }

  // Đã chấm thì không cho nộp lại (RLS cũng chặn, đây để báo lỗi rõ ràng)
  const { data: existing } = await supabase
    .from("speaking_submissions")
    .select("id, status, storage_path")
    .eq("prompt_id", promptId)
    .eq("membership_id", membership.id)
    .maybeSingle();

  if (existing?.status === "graded") {
    return Response.json({ error: "Bài đã được chấm, không thể nộp lại" }, { status: 409 });
  }

  const admin = createAdminClient();

  // ── Bước 1: xin signed URL để upload ──
  if (body?.action === "upload-url") {
    const { mime_type, size_bytes, duration_ms } = body;

    if (!ALLOWED_MIME.includes(mime_type)) {
      return Response.json({ error: `Định dạng không hỗ trợ: ${mime_type}` }, { status: 400 });
    }
    if (!Number.isInteger(size_bytes) || size_bytes <= 0 || size_bytes > MAX_BYTES) {
      return Response.json({ error: "Dung lượng file không hợp lệ (tối đa 15MB)" }, { status: 400 });
    }
    // Chặn bài dài hơn cho phép — kiểm ở server, không tin client
    if (Number.isInteger(duration_ms) && duration_ms > prompt.max_seconds * 1000 + 5000) {
      return Response.json(
        { error: `Bài nói vượt thời lượng cho phép (${prompt.max_seconds} giây)` },
        { status: 400 }
      );
    }

    // Kiểm quota org
    const { data: quota } = await admin.rpc("check_storage_quota", {
      p_org_id: prompt.org_id,
      p_bytes: size_bytes,
    });
    if (!quota?.allowed) {
      return Response.json(
        { error: "Trung tâm đã hết dung lượng lưu trữ", quota_exceeded: true },
        { status: 413 }
      );
    }

    const ext = mime_type === "audio/webm" ? "webm" : mime_type.split("/")[1] || "webm";
    // org_id ở ĐẦU đường dẫn để Storage RLS so được với JWT
    const path = `${prompt.org_id}/${prompt.class_id}/${promptId}/${crypto.randomUUID()}.${ext}`;

    const { data: signed, error: signErr } = await admin.storage
      .from("speaking-submissions")
      .createSignedUploadUrl(path);

    if (signErr) {
      console.error("[speaking/submit] signed URL lỗi:", signErr.message);
      return Response.json({ error: "Không tạo được link upload" }, { status: 500 });
    }

    return Response.json({ upload_url: signed.signedUrl, token: signed.token, storage_path: path });
  }

  // ── Bước 2: đăng ký bài đã upload ──
  const { storage_path, duration_ms } = body || {};

  if (typeof storage_path !== "string" || !storage_path.startsWith(`${prompt.org_id}/`)) {
    return Response.json({ error: "storage_path không hợp lệ" }, { status: 400 });
  }

  // XÁC MINH file thật sự tồn tại + lấy dung lượng THẬT từ Storage.
  // Không tin size client gửi — nếu tin thì báo 1 byte là lách quota.
  const folder = storage_path.slice(0, storage_path.lastIndexOf("/"));
  const fileName = storage_path.slice(storage_path.lastIndexOf("/") + 1);

  const { data: listed, error: listErr } = await admin.storage
    .from("speaking-submissions")
    .list(folder, { limit: 100, search: fileName });

  if (listErr) {
    console.error("[speaking/submit] kiểm file lỗi:", listErr.message);
    return Response.json({ error: "Không xác minh được file" }, { status: 500 });
  }

  const found = (listed || []).find((f) => f.name === fileName);
  if (!found) {
    return Response.json(
      { error: "Chưa thấy file trên hệ thống. Hãy upload trước khi nộp." },
      { status: 409 }
    );
  }

  const sizeBytes = found.metadata?.size ?? null;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return Response.json({ error: "Không đọc được dung lượng file" }, { status: 500 });
  }

  const now = new Date();
  const isLate = prompt.due_at ? now > new Date(prompt.due_at) : false;

  // Nộp lại: xoá audio cũ để không thành rác chiếm quota
  if (existing?.storage_path && existing.storage_path !== storage_path) {
    await admin.storage.from("speaking-submissions").remove([existing.storage_path]);
  }

  const { data: saved, error: saveErr } = await supabase
    .from("speaking_submissions")
    .upsert(
      {
        prompt_id: promptId,
        membership_id: membership.id,
        org_id: prompt.org_id,
        storage_path,
        duration_ms: Number.isInteger(duration_ms) ? duration_ms : null,
        size_bytes: sizeBytes,
        status: "submitted",
        submitted_at: now.toISOString(),
        is_late: isLate,
        // Hẹn hạn xoá audio ngay từ lúc nộp: nếu GV không chấm thì audio
        // vẫn được dọn, không tồn vĩnh viễn.
        audio_expires_at: new Date(
          now.getTime() + AUDIO_RETENTION_DAYS * 86400_000
        ).toISOString(),
        audio_deleted: false,
      },
      { onConflict: "prompt_id,membership_id" }
    )
    .select("id, status, submitted_at, is_late, duration_ms")
    .single();

  if (saveErr) {
    console.error("[speaking/submit] lưu lỗi:", saveErr.message);
    // Dọn blob nếu ghi DB thất bại, tránh file mồ côi
    await admin.storage.from("speaking-submissions").remove([storage_path]);
    return Response.json({ error: "Không lưu được bài nộp" }, { status: 500 });
  }

  return Response.json({ submission: saved }, { status: 201 });
}
