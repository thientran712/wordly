// GET  /api/classes/[id]/assignments — danh sách bộ từ đã giao
// POST /api/classes/[id]/assignments — giao bộ từ cho lớp
//
// Điểm mấu chốt: KHÔNG xây gì mới cho phần phân phối. Bộ từ được giao chỉ là
// nguồn nạp vào hàng đợi ôn tập mà select-word-for-email.js đã xử lý sẵn —
// học viên nhận qua email và thấy trong app bằng đúng cơ chế FSRS hiện có.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import { inngest } from "@/inngest/client";

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export async function GET(request, { params }) {
  const { id: classId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("class_assignments")
    .select("id, title, filter_level, filter_topic, explicit_word_ids, daily_count, start_date, end_date, created_at")
    .eq("class_id", classId)
    .order("start_date", { ascending: false });

  if (error) {
    console.error("[classes/assignments] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách bài giao" }, { status: 500 });
  }

  return Response.json({ assignments: data || [] });
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

  const { filter_level, filter_topic, explicit_word_ids, daily_count, start_date, end_date } = body || {};

  if (filter_level && !CEFR_LEVELS.includes(filter_level)) {
    return Response.json({ error: `Trình độ không hợp lệ: ${filter_level}` }, { status: 400 });
  }

  const wordIds = Array.isArray(explicit_word_ids) ? explicit_word_ids.filter(isUuid) : [];

  // Phải có ít nhất một cách chọn từ (DB cũng có CHECK constraint, nhưng bắt
  // sớm ở đây cho thông báo lỗi rõ ràng hơn).
  if (!filter_level && !filter_topic && wordIds.length === 0) {
    return Response.json(
      { error: "Phải chọn trình độ, chủ đề, hoặc danh sách từ cụ thể" },
      { status: 400 }
    );
  }

  const dailyCount = Number.isInteger(daily_count) ? daily_count : 5;
  if (dailyCount < 1 || dailyCount > 50) {
    return Response.json({ error: "Số từ mỗi ngày phải từ 1 đến 50" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", classId)
    .maybeSingle();

  if (!klass) {
    return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });
  }

  const featureBlock = await requireFeature(klass.org_id, "vocabulary_assignments");
  if (featureBlock) return featureBlock;

  const { data: created, error } = await supabase
    .from("class_assignments")
    .insert({
      class_id: classId,
      org_id: klass.org_id,
      session_id: isUuid(body?.session_id) ? body.session_id : null,
      title,
      filter_level: filter_level || null,
      filter_topic: filter_topic || null,
      explicit_word_ids: wordIds,
      daily_count: dailyCount,
      start_date: start_date || new Date().toISOString().slice(0, 10),
      end_date: end_date || null,
      created_by: user.id,
    })
    .select("id, title, filter_level, filter_topic, explicit_word_ids, daily_count, start_date, end_date")
    .single();

  if (error) {
    console.error("[classes/assignments] POST lỗi:", error.message);
    return Response.json({ error: "Không giao được bài" }, { status: 500 });
  }

  // Nạp từ vào hàng đợi học viên bằng job nền — không để người dùng đợi,
  // vì lớp có thể có hàng chục học viên × hàng chục từ.
  try {
    await inngest.send({
      name: "assignment/created",
      data: { assignment_id: created.id, class_id: classId, org_id: klass.org_id },
    });
  } catch (e) {
    // Bài giao đã lưu; nếu gửi event lỗi thì job đồng bộ hằng ngày sẽ nạp bù.
    console.error("[classes/assignments] gửi event lỗi:", e.message);
  }

  return Response.json({ assignment: created }, { status: 201 });
}
