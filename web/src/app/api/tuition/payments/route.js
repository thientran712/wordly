// POST /api/tuition/payments — ghi nhận một lần đóng tiền (chỉ owner)
//
// Bản ghi thanh toán là BẤT BIẾN: không có PATCH/DELETE ở đây, và DB cũng
// không grant UPDATE/DELETE. Sổ sách tài chính phải giữ nguyên lịch sử —
// nhập sai thì ghi phiếu điều chỉnh, không sửa quá khứ.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { requireOwner, isUuid } from "@/lib/org-context";
import { computeBalance } from "@/lib/tuition-calc";

const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "ewallet", "other"];

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { tuition_record_id, amount, method, paid_at, reference, note } = body || {};

  if (!isUuid(tuition_record_id)) {
    return Response.json({ error: "tuition_record_id không hợp lệ" }, { status: 400 });
  }

  const amountInt = Math.round(Number(amount));
  if (!Number.isFinite(amountInt) || amountInt <= 0) {
    return Response.json({ error: "Số tiền phải lớn hơn 0" }, { status: 400 });
  }

  const payMethod = PAYMENT_METHODS.includes(method) ? method : "cash";

  const supabase = await createClient();

  // Lấy khoản học phí để biết org (RLS chỉ cho owner đọc bảng này).
  const { data: record } = await supabase
    .from("tuition_records")
    .select("id, org_id, total_due, title")
    .eq("id", tuition_record_id)
    .maybeSingle();

  if (!record) {
    return Response.json({ error: "Không tìm thấy khoản học phí" }, { status: 404 });
  }

  const guard = await requireOwner(record.org_id);
  if (!guard.ok) return guard.response;

  // Cảnh báo nếu đóng thừa — vẫn cho ghi (phụ huynh có thể trả trước cho
  // khoá sau), nhưng phải nói rõ để người thu tiền biết.
  const { data: existingPayments } = await supabase
    .from("tuition_payments")
    .select("amount")
    .eq("tuition_record_id", tuition_record_id);

  const before = computeBalance(record.total_due, existingPayments || []);
  const after = computeBalance(record.total_due, [
    ...(existingPayments || []),
    { amount: amountInt },
  ]);

  const { data: created, error } = await supabase
    .from("tuition_payments")
    .insert({
      tuition_record_id,
      org_id: record.org_id,
      amount: amountInt,
      method: payMethod,
      paid_at: paid_at || new Date().toISOString(),
      reference: reference?.trim() || null,
      note: note?.trim() || null,
      recorded_by: user.id,
    })
    .select("id, amount, method, paid_at, reference, created_at")
    .single();

  if (error) {
    console.error("[tuition/payments] POST lỗi:", error.message);
    return Response.json({ error: "Không ghi nhận được thanh toán" }, { status: 500 });
  }

  return Response.json(
    {
      payment: created,
      balance: after,
      // Thông báo rõ cho người thu tiền
      warning:
        after.overpaid > 0
          ? `Đã đóng thừa ${after.overpaid.toLocaleString("vi-VN")} ₫ so với khoản "${record.title}"`
          : null,
      was_outstanding: before.outstanding,
    },
    { status: 201 }
  );
}
