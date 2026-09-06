// GET /api/tuition/vnpay-return — người dùng được VNPay redirect về đây
// sau khi thanh toán (thành công hoặc thất bại/huỷ).
//
// QUAN TRỌNG VỀ BẢO MẬT: route này CHỈ dùng để HIỂN THỊ kết quả cho người
// dùng — KHÔNG dùng để xác nhận thanh toán cuối cùng. Return URL có thể bị
// người dùng đóng trình duyệt giữa chừng, mất mạng, hoặc bị giả mạo redirect
// thủ công. Nguồn sự thật DUY NHẤT để ghi nhận "đã thanh toán" là IPN
// (server-to-server, xem route vnpay-ipn) — đây là khuyến nghị chính thức
// của VNPay, không phải lựa chọn tuỳ ý.
//
// Route này VẪN xác minh chữ ký (không tin dữ liệu URL) để tránh hiện sai
// thông báo cho người dùng, nhưng không ghi DB gì ở đây.

import { createAdminClient } from "@/lib/supabase-admin";
import { verifyReturnSignature } from "@/lib/vnpay";

export async function GET(request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());

  const txnRef = params.vnp_TxnRef;
  if (!txnRef) {
    return redirectToResult("invalid", null);
  }

  const admin = createAdminClient();

  // Cần org_id để lấy đúng hash secret — tra qua vnp_txn_ref
  const { data: txn } = await admin
    .from("vnpay_transactions")
    .select("org_id, tuition_record_id, status")
    .eq("vnp_txn_ref", txnRef)
    .maybeSingle();

  if (!txn) {
    return redirectToResult("not_found", null);
  }

  const { data: hashSecret } = await admin.rpc("get_vnpay_secret", { p_org_id: txn.org_id });

  const validSignature = hashSecret ? verifyReturnSignature({ hashSecret }, params) : false;

  if (!validSignature) {
    console.error(`[vnpay-return] chữ ký KHÔNG hợp lệ cho giao dịch ${txnRef} — có thể bị giả mạo`);
    return redirectToResult("invalid_signature", txn.tuition_record_id);
  }

  // Chỉ dùng để HIỂN THỊ — trạng thái thật đã (hoặc sẽ) được IPN ghi nhận.
  // Nếu IPN chưa tới kịp (hiếm, do độ trễ mạng), người dùng có thể thấy
  // "đang xử lý" dù thật ra đã thành công — chấp nhận được vì IPN sẽ tự
  // cập nhật trong vài giây và trang có thể refresh.
  const isSuccess = params.vnp_ResponseCode === "00";
  return redirectToResult(isSuccess ? "success" : "failed", txn.tuition_record_id);
}

function redirectToResult(status, tuitionRecordId) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const q = new URLSearchParams({ status });
  if (tuitionRecordId) q.set("tuition_id", tuitionRecordId);
  return Response.redirect(`${baseUrl}/tuition/payment-result?${q.toString()}`, 302);
}
