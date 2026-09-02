// POST   /api/materials      — đăng ký tài liệu sau khi upload xong (hoặc link ngoài)
// DELETE /api/materials?id=  — xoá tài liệu (xoá cả blob để hoàn quota)

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
// isAllowedLink có test riêng, gồm ca chống lừa subdomain
// ("youtube.com.evil.com") và chặn javascript:/data:
import { isAllowedLink } from "@/lib/material-validation";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { session_id, kind, title, description, storage_path, external_url, allow_download } = body || {};

  if (!isUuid(session_id)) {
    return Response.json({ error: "session_id không hợp lệ" }, { status: 400 });
  }
  if (!["document", "audio", "link"].includes(kind)) {
    // 'video' chưa mở ở GĐ1 — cần dịch vụ transcode/streaming (GĐ2)
    return Response.json(
      { error: "kind phải là 'document', 'audio' hoặc 'link'. Video upload trực tiếp chưa hỗ trợ — dùng link YouTube/Drive." },
      { status: 400 }
    );
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS kiểm quyền ghi: chỉ owner hoặc GV của lớp thấy được session này.
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, class_id, org_id")
    .eq("id", session_id)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: "Không tìm thấy buổi học" }, { status: 404 });
  }

  const admin = createAdminClient();
  let sizeBytes = null;
  let mimeType = null;

  if (kind === "link") {
    if (!isAllowedLink(external_url)) {
      return Response.json(
        { error: "Chỉ hỗ trợ link https từ YouTube, Google Drive, Vimeo hoặc OneDrive" },
        { status: 400 }
      );
    }
  } else {
    if (typeof storage_path !== "string" || !storage_path.startsWith(`${session.org_id}/`)) {
      return Response.json({ error: "storage_path không hợp lệ" }, { status: 400 });
    }

    // XÁC MINH file thật sự tồn tại và lấy dung lượng THẬT từ Storage.
    // Không tin size client gửi — nếu tin thì client báo 1 byte là lách
    // được quota hoàn toàn.
    const folder = storage_path.slice(0, storage_path.lastIndexOf("/"));
    const fileName = storage_path.slice(storage_path.lastIndexOf("/") + 1);

    const { data: listed, error: listErr } = await admin.storage
      .from("lesson-materials")
      .list(folder, { limit: 100, search: fileName });

    if (listErr) {
      console.error("[api/materials] lỗi kiểm file:", listErr.message);
      return Response.json({ error: "Không xác minh được file" }, { status: 500 });
    }

    const found = (listed || []).find((f) => f.name === fileName);
    if (!found) {
      return Response.json(
        { error: "Chưa thấy file trên hệ thống. Hãy upload trước khi đăng ký." },
        { status: 409 }
      );
    }

    sizeBytes = found.metadata?.size ?? null;
    mimeType = found.metadata?.mimetype ?? null;

    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return Response.json({ error: "Không đọc được dung lượng file" }, { status: 500 });
    }

    // Kiểm quota LẦN NỮA với dung lượng thật — giữa lúc xin URL và lúc
    // đăng ký, org có thể đã upload file khác và vượt hạn mức.
    const { data: quota } = await admin.rpc("check_storage_quota", {
      p_org_id: session.org_id,
      p_bytes: sizeBytes,
    });

    if (!quota?.allowed) {
      // Dọn file vừa upload để không thành rác chiếm dung lượng.
      await admin.storage.from("lesson-materials").remove([storage_path]);
      return Response.json(
        { error: "Đã dùng hết dung lượng lưu trữ", quota_exceeded: true },
        { status: 413 }
      );
    }
  }

  // Trigger enforce_material_tenant tự điền class_id/org_id từ session,
  // và trigger track_storage_usage tự cộng bytes_used.
  const { data: created, error: insertErr } = await supabase
    .from("lesson_materials")
    .insert({
      session_id,
      class_id: session.class_id,
      org_id: session.org_id,
      kind,
      title: cleanTitle,
      description: description?.trim() || null,
      storage_path: kind === "link" ? null : storage_path,
      external_url: kind === "link" ? external_url : null,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      allow_download: allow_download !== false,
      uploaded_by: user.id,
    })
    .select("id, kind, title, description, size_bytes, allow_download, external_url, created_at")
    .single();

  if (insertErr) {
    console.error("[api/materials] lỗi insert:", insertErr.message);
    // Dọn blob nếu ghi DB thất bại, tránh file mồ côi.
    if (kind !== "link" && storage_path) {
      await admin.storage.from("lesson-materials").remove([storage_path]);
    }
    return Response.json({ error: "Không lưu được tài liệu" }, { status: 500 });
  }

  return Response.json({ material: created }, { status: 201 });
}

export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // Lấy storage_path TRƯỚC khi xoá hàng — sau khi xoá thì không còn đường
  // nào biết blob nằm ở đâu, và nó sẽ thành rác vĩnh viễn.
  const { data: material } = await supabase
    .from("lesson_materials")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!material) {
    return Response.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  }

  // RLS chặn nếu không có quyền. Trigger tự trừ bytes_used.
  const { error: delErr } = await supabase.from("lesson_materials").delete().eq("id", id);
  if (delErr) {
    console.error("[api/materials] lỗi xoá:", delErr.message);
    return Response.json({ error: "Không xoá được tài liệu" }, { status: 500 });
  }

  // Xoá blob sau khi DB đã xoá thành công.
  if (material.storage_path) {
    const admin = createAdminClient();
    const { error: rmErr } = await admin.storage
      .from("lesson-materials")
      .remove([material.storage_path]);
    // Blob còn lại sẽ được job cleanupOrphanedFiles dọn hằng tuần, nên
    // lỗi ở đây không cần làm request thất bại.
    if (rmErr) {
      console.error("[api/materials] blob còn lại, job dọn rác sẽ xử lý:", rmErr.message);
    }
  }

  return Response.json({ ok: true });
}
