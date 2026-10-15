import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { parseConsentBody } from "@/lib/legal/terms";

// Người dùng bấm "Đồng ý" Điều khoản + Chính sách (spec 2026-10-15-terms-consent-design.md).
// Thời điểm do server đặt; client của người dùng (RLS: chỉ sửa được hồ sơ mình).
export async function POST(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseConsentBody(await request.json().catch(() => null));
  if (parsed.error === "outdated") {
    return Response.json({ error: "Điều khoản đã được cập nhật, mở lại để xem bản mới." }, { status: 409 });
  }
  if (parsed.error) {
    return Response.json({ error: "Invalid version" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ terms_version: parsed.version, terms_accepted_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("terms_version, terms_accepted_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  return Response.json({ success: true, ...data });
}
