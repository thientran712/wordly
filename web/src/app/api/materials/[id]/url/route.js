// GET /api/materials/[id]/url — phát signed URL để xem/tải tài liệu.
//
// Bucket là PRIVATE nên không có URL công khai. Mọi lượt xem đều đi qua đây
// để kiểm quyền trước, rồi phát URL có hạn 1 giờ.
//
// Nếu để bucket public thì tài liệu của trung tâm A ai có link cũng xem được
// — không chấp nhận được với B2B.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";

const SIGNED_URL_TTL_SECONDS = 3600; // 1 giờ

export async function GET(request, { params }) {
  const { id } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(id)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS quyết định ai đọc được hàng này:
  //   - staff: mọi tài liệu trong lớp mình dạy
  //   - học viên: chỉ tài liệu của buổi học đã published
  // Không có quyền → query trả rỗng → 404.
  const { data: material, error } = await supabase
    .from("lesson_materials")
    .select("id, kind, title, storage_path, external_url, allow_download, mime_type")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[materials/url] lỗi truy vấn:", error.message);
    return Response.json({ error: "Không tải được tài liệu" }, { status: 500 });
  }
  if (!material) {
    return Response.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
  }

  // Link ngoài thì trả thẳng, không cần signed URL.
  if (material.kind === "link") {
    return Response.json({
      url: material.external_url,
      kind: "link",
      allow_download: false,
    });
  }

  if (!material.storage_path) {
    return Response.json({ error: "Tài liệu không có file" }, { status: 409 });
  }

  // Dùng admin client để phát signed URL: Storage RLS đã kiểm ở tầng bucket,
  // nhưng quyền thật sự đã được kiểm ở query trên bằng RLS của bảng.
  const admin = createAdminClient();

  // Client có thể xin bản "để tải về" qua ?download=1. Chỉ chấp nhận khi
  // giáo viên cho phép tải tài liệu đó.
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const asDownload = wantsDownload && material.allow_download;

  if (wantsDownload && !material.allow_download) {
    return Response.json(
      { error: "Tài liệu này chỉ được xem, không cho tải về" },
      { status: 403 }
    );
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("lesson-materials")
    .createSignedUrl(material.storage_path, SIGNED_URL_TTL_SECONDS, {
      // download=true buộc trình duyệt tải về (Content-Disposition:
      // attachment); bỏ trống thì xem trực tiếp trong tab.
      ...(asDownload ? { download: material.title || true } : {}),
    });

  if (signErr) {
    console.error("[materials/url] lỗi signed URL:", signErr.message);
    return Response.json({ error: "Không tạo được link xem" }, { status: 500 });
  }

  return Response.json({
    url: signed.signedUrl,
    kind: material.kind,
    mime_type: material.mime_type,
    allow_download: material.allow_download,
    expires_in: SIGNED_URL_TTL_SECONDS,
  });
}
