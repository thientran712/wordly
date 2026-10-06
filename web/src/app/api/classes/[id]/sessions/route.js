// GET  /api/classes/[id]/sessions — danh sách buổi học kèm tài liệu
// POST /api/classes/[id]/sessions — tạo buổi học

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";

export async function GET(request, { params }) {
  const { id: classId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS lo phần lọc: staff thấy cả draft, học viên chỉ thấy published.
  // Tài liệu cũng được RLS lọc theo cùng nguyên tắc.
  const { data, error } = await supabase
    .from("class_sessions")
    .select(`
      id, title, notes, session_date, order_index, status, created_at,
      lesson_materials(
        id, kind, title, description, size_bytes,
        allow_download, external_url, mime_type, created_at
      )
    `)
    .eq("class_id", classId)
    .order("order_index", { ascending: true })
    .order("session_date", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[classes/sessions] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được buổi học" }, { status: 500 });
  }

  return Response.json({ sessions: data || [] });
}

export async function POST(request, { params }) {
  const { id: classId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const title = (body?.title || "").trim();
  if (!title || title.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  const supabase = await createClient();

  // Lấy org_id từ lớp — RLS đã đảm bảo chỉ thấy lớp mình có quyền.
  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", classId)
    .maybeSingle();

  if (!klass) {
    return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });
  }

  // order_index kế tiếp: đặt buổi mới xuống cuối danh sách.
  const { data: last } = await supabase
    .from("class_sessions")
    .select("order_index")
    .eq("class_id", classId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextIndex = (last?.order_index ?? -1) + 1;

  // Trigger enforce_session_tenant tự điền org_id đúng từ lớp.
  const { data: created, error } = await supabase
    .from("class_sessions")
    .insert({
      class_id: classId,
      org_id: klass.org_id,
      title,
      notes: body?.notes?.trim() || null,
      session_date: body?.session_date || null,
      order_index: nextIndex,
      status: body?.status === "published" ? "published" : "draft",
      created_by: user.id,
    })
    .select("id, title, notes, session_date, order_index, status, created_at")
    .single();

  if (error) {
    console.error("[classes/sessions] POST lỗi:", error.message);
    return Response.json({ error: "Không tạo được buổi học" }, { status: 500 });
  }

  return Response.json({ session: { ...created, lesson_materials: [] } }, { status: 201 });
}
