// GET /api/materials/[id]/video-url — lấy URL phát video cho người xem.
//
// VÌ SAO CẦN ROUTE RIÊNG: R2 KHÔNG có RLS như Supabase Storage — bất kỳ ai
// biết object key đều tải được nếu key lộ ra. Nên quyền xem PHẢI được kiểm
// ở tầng ứng dụng (route này), không dựa vào việc "key khó đoán".
//
// RLS trên bảng lesson_materials vẫn là lớp kiểm chính: chỉ SELECT được
// nếu là thành viên org sở hữu buổi học. Route này chỉ phát URL SAU KHI
// query đã qua được RLS.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { getPlaybackUrl } from "@/lib/r2-client";

export async function GET(request, { params }) {
  const { id } = await params; // Next 16: params là Promise

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (!isUuid(id)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS quyết định ai thấy được hàng này. Không phải thành viên org sở
  // hữu buổi học → query trả rỗng → 404 (không tiết lộ video có tồn tại).
  const { data: material, error } = await supabase
    .from("lesson_materials")
    .select("id, kind, provider, provider_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[materials/video-url] lỗi query:", error.message);
    return Response.json({ error: "Không tải được video" }, { status: 500 });
  }
  if (!material || material.kind !== "video" || material.provider !== "r2") {
    return Response.json({ error: "Không tìm thấy video" }, { status: 404 });
  }

  try {
    const url = await getPlaybackUrl(material.provider_id);
    return Response.json({ playback_url: url });
  } catch (e) {
    console.error("[materials/video-url] lỗi tạo playback URL:", e.message);
    return Response.json({ error: "Không tạo được link phát video" }, { status: 500 });
  }
}
