// GET  /api/tuition?org_id=  — danh sách học phí + công nợ
// POST /api/tuition           — tạo khoản học phí (chỉ owner)
//
// Nghiệp vụ tài chính: mọi số tiền được tính LẠI ở server bằng
// tuition-calc.js (đã có 25 test), không tin số client gửi.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { requireOwner, requireOrgRole, isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import { calculateTuition, TUITION_MODELS } from "@/lib/tuition-calc";

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const orgId = url.searchParams.get("org_id");
  const classId = url.searchParams.get("class_id");
  const membershipId = url.searchParams.get("membership_id");

  // Học viên/phụ huynh cũng được xem khoản của mình (minh bạch học phí),
  // nên không giới hạn ở owner — RLS lo phần lọc.
  const guard = await requireOrgRole(orgId);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  let query = supabase
    .from("tuition_balances")
    .select("*")
    .eq("org_id", orgId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (isUuid(classId)) query = query.eq("class_id", classId);
  if (isUuid(membershipId)) query = query.eq("membership_id", membershipId);

  const { data, error } = await query;

  if (error) {
    console.error("[api/tuition] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được học phí" }, { status: 500 });
  }

  const records = data || [];

  // Tổng hợp cho owner: tổng phải thu, đã thu, còn nợ, số khoản quá hạn.
  const summary = records.reduce(
    (acc, r) => {
      acc.total_due += Number(r.total_due) || 0;
      acc.paid += Number(r.paid) || 0;
      acc.outstanding += Number(r.outstanding) || 0;
      if (r.is_overdue) acc.overdue_count += 1;
      return acc;
    },
    { total_due: 0, paid: 0, outstanding: 0, overdue_count: 0 }
  );

  return Response.json({ records, summary, role: guard.role });
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { org_id, membership_id, class_id, title, model, note, due_date } = body || {};

  // Chỉ owner tạo khoản học phí — giáo viên không được chạm vào tiền.
  const guard = await requireOwner(org_id);
  if (!guard.ok) return guard.response;

  const featureBlock = await requireFeature(org_id, "tuition");
  if (featureBlock) return featureBlock;

  if (!isUuid(membership_id)) {
    return Response.json({ error: "membership_id không hợp lệ" }, { status: 400 });
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  if (!TUITION_MODELS.includes(model)) {
    return Response.json(
      { error: `Mô hình học phí không hợp lệ. Chọn: ${TUITION_MODELS.join(", ")}` },
      { status: 400 }
    );
  }

  // TÍNH LẠI ở server — không bao giờ tin subtotal/total client gửi lên.
  const calc = calculateTuition({
    model,
    course_fee: body.course_fee,
    session_fee: body.session_fee,
    session_count: body.session_count,
    monthly_fee: body.monthly_fee,
    month_count: body.month_count,
    discount_percent: body.discount_percent,
    discount_amount: body.discount_amount,
  });

  if (!calc.ok) {
    return Response.json({ error: calc.error }, { status: 400 });
  }

  // Lưu lại tham số đầu vào để về sau còn giải thích được con số.
  const unitFee =
    model === "per_course"
      ? Number(body.course_fee) || 0
      : model === "per_session"
      ? Number(body.session_fee) || 0
      : Number(body.monthly_fee) || 0;

  const unitCount =
    model === "per_course"
      ? 1
      : model === "per_session"
      ? Number(body.session_count) || 0
      : Number(body.month_count) || 0;

  const supabase = await createClient();

  const { data: created, error } = await supabase
    .from("tuition_records")
    .insert({
      org_id,
      membership_id,
      class_id: isUuid(class_id) ? class_id : null,
      title: cleanTitle,
      model,
      unit_fee: Math.round(unitFee),
      unit_count: Math.round(unitCount),
      subtotal: calc.subtotal,
      discount_amount: calc.discount_amount,
      total_due: calc.total,
      due_date: due_date || null,
      note: note?.trim() || null,
      created_by: user.id,
    })
    .select("id, title, model, subtotal, discount_amount, total_due, due_date, created_at")
    .single();

  if (error) {
    console.error("[api/tuition] POST lỗi:", error.message);
    return Response.json({ error: "Không tạo được khoản học phí" }, { status: 500 });
  }

  return Response.json({ record: created }, { status: 201 });
}
