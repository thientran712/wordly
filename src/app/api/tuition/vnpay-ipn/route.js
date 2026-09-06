// GET /api/tuition/vnpay-ipn — VNPay gọi server-to-server để báo kết quả
// GIAO DỊCH CUỐI CÙNG (không qua trình duyệt người dùng).
//
// ĐÂY LÀ NGUỒN SỰ THẬT DUY NHẤT để ghi nhận thanh toán — không phải
// vnpay-return. VNPay gọi IPN độc lập với việc người dùng có ở lại trang
// hay không, nên đáng tin hơn nhiều.
//
// PHẢI trả đúng format {RspCode, Message} theo tài liệu VNPay — nếu không,
// VNPay coi là thất bại và GỌI LẠI NHIỀU LẦN, có thể gây double-processing
// nếu code không idempotent.
//
// IDEMPOTENT: kiểm status hiện tại TRƯỚC khi update — gọi IPN trùng lặp
// (VNPay có thể gọi lại) không được tạo thêm bản ghi tuition_payments.

import { createAdminClient } from "@/lib/supabase-admin";
import { verifyIpnSignature, vndFromVnpAmount } from "@/lib/vnpay";

const IPN_RESPONSE = {
  ok: { RspCode: "00", Message: "Confirm Success" },
  invalidSignature: { RspCode: "97", Message: "Invalid signature" },
  orderNotFound: { RspCode: "01", Message: "Order not found" },
  amountMismatch: { RspCode: "04", Message: "Invalid amount" },
  alreadyConfirmed: { RspCode: "02", Message: "Order already confirmed" },
  unknownError: { RspCode: "99", Message: "Unknown error" },
};

export async function GET(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const txnRef = params.vnp_TxnRef;
  if (!txnRef) {
    return Response.json(IPN_RESPONSE.orderNotFound);
  }

  const admin = createAdminClient();

  const { data: txn, error: txnErr } = await admin
    .from("vnpay_transactions")
    .select("id, org_id, amount, status")
    .eq("vnp_txn_ref", txnRef)
    .maybeSingle();

  if (txnErr) {
    console.error("[vnpay-ipn] lỗi đọc giao dịch:", txnErr.message);
    return Response.json(IPN_RESPONSE.unknownError);
  }
  if (!txn) {
    return Response.json(IPN_RESPONSE.orderNotFound);
  }

  // ── Xác minh chữ ký — KHÔNG được bỏ qua bước này ──
  const { data: hashSecret, error: secretErr } = await admin.rpc("get_vnpay_secret", {
    p_org_id: txn.org_id,
  });

  if (secretErr || !hashSecret || !verifyIpnSignature({ hashSecret }, params)) {
    console.error(`[vnpay-ipn] chữ ký KHÔNG hợp lệ cho giao dịch ${txnRef} — TỪ CHỐI, không ghi nhận thanh toán`);
    return Response.json(IPN_RESPONSE.invalidSignature);
  }

  // ── Xác minh số tiền khớp — chặn tấn công đổi amount trong quá trình
  // redirect (dù chữ ký đã bảo vệ, kiểm thêm lớp nghiệp vụ ở đây) ──
  const receivedAmount = vndFromVnpAmount(params.vnp_Amount);
  if (receivedAmount !== txn.amount) {
    console.error(
      `[vnpay-ipn] SỐ TIỀN KHÔNG KHỚP cho ${txnRef}: DB=${txn.amount} VNPay=${receivedAmount}`
    );
    return Response.json(IPN_RESPONSE.amountMismatch);
  }

  // ── Idempotent: đã xử lý rồi thì báo VNPay biết, không ghi lại ──
  // VNPay có thể gọi IPN nhiều lần cho cùng giao dịch (mạng chập chờn,
  // hoặc VNPay tự retry khi chưa nhận được RspCode=00 kịp thời).
  if (txn.status === "success" || txn.status === "failed" || txn.status === "cancelled") {
    return Response.json(IPN_RESPONSE.alreadyConfirmed);
  }

  const isSuccess = params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";

  // Trigger record_vnpay_payment (migration) TỰ ĐỘNG tạo tuition_payments
  // khi status chuyển thành 'success' — không cần code ở đây gọi thêm.
  const { error: updateErr } = await admin
    .from("vnpay_transactions")
    .update({
      status: isSuccess ? "success" : "failed",
      vnp_response_code: params.vnp_ResponseCode,
      vnp_transaction_no: params.vnp_TransactionNo || null,
      vnp_bank_code: params.vnp_BankCode || null,
      raw_response: params,
      completed_at: new Date().toISOString(),
    })
    .eq("id", txn.id)
    // Chặn race condition: chỉ update nếu status VẪN CÒN pending — nếu 2
    // lượt gọi IPN đồng thời lọt qua kiểm tra ở trên (hiếm nhưng có thể),
    // đây là lớp bảo vệ cuối để không update 2 lần.
    .eq("status", "pending");

  if (updateErr) {
    console.error("[vnpay-ipn] lỗi cập nhật giao dịch:", updateErr.message);
    return Response.json(IPN_RESPONSE.unknownError);
  }

  return Response.json(IPN_RESPONSE.ok);
}
