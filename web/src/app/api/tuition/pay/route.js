// POST /api/tuition/pay — tạo link thanh toán VNPay cho một khoản học phí.
//
// Người gọi: học viên/phụ huynh (RLS đã cho họ xem khoản của mình), hoặc
// owner (đang đứng ra thu hộ). Trả về URL để redirect sang VNPay.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { buildPaymentUrl } from "@/lib/vnpay";
import { createRateLimiter, clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";

// Tạo giao dịch tốn 1 lượt gọi VNPay + ghi DB — giới hạn vừa phải để
// tránh spam tạo hàng loạt giao dịch pending vô ích.
const limiter = createRateLimiter({ limit: 10, windowMs: 300_000 });

const SANDBOX_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
const PRODUCTION_URL = "https://vnpayment.vn/paymentv2/vpcpay.html";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = limiter.check(clientKeyFromRequest(request, user.id));
  if (!rl.allowed) return rateLimitResponse(rl);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { tuition_record_id } = body || {};
  if (!isUuid(tuition_record_id)) {
    return Response.json({ error: "tuition_record_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ trả về khoản mà user được phép xem (chính mình hoặc owner)
  const { data: record, error: recordErr } = await supabase
    .from("tuition_records")
    .select("id, org_id, total_due")
    .eq("id", tuition_record_id)
    .maybeSingle();

  if (recordErr) {
    console.error("[tuition/pay] lỗi đọc khoản học phí:", recordErr.message);
    return Response.json({ error: "Không đọc được khoản học phí" }, { status: 500 });
  }
  if (!record) {
    return Response.json({ error: "Không tìm thấy khoản học phí" }, { status: 404 });
  }

  // Đọc số dư còn phải trả TỪ VIEW tuition_balances (đã tính sẵn, khớp mọi
  // nơi khác dùng con số này) — không tự tính lại ở đây.
  const { data: balance } = await supabase
    .from("tuition_balances")
    .select("outstanding")
    .eq("tuition_record_id", tuition_record_id)
    .maybeSingle();

  const outstanding = balance?.outstanding ?? record.total_due;
  if (outstanding <= 0) {
    return Response.json({ error: "Khoản học phí này đã thanh toán đủ" }, { status: 409 });
  }

  const admin = createAdminClient();

  // Cấu hình VNPay của org — cần cả tmn_code (metadata, đọc qua RLS) lẫn
  // hash_secret (bí mật, chỉ đọc qua RPC service_role).
  const { data: config, error: configErr } = await admin
    .from("org_payment_configs")
    .select("tmn_code, environment, enabled")
    .eq("org_id", record.org_id)
    .maybeSingle();

  if (configErr) {
    console.error("[tuition/pay] lỗi đọc cấu hình:", configErr.message);
    return Response.json({ error: "Không đọc được cấu hình thanh toán" }, { status: 500 });
  }
  if (!config || !config.enabled) {
    return Response.json(
      { error: "Trung tâm chưa bật thanh toán online. Vui lòng liên hệ trực tiếp." },
      { status: 409 }
    );
  }

  const { data: hashSecret, error: secretErr } = await admin.rpc("get_vnpay_secret", {
    p_org_id: record.org_id,
  });

  if (secretErr || !hashSecret) {
    console.error("[tuition/pay] lỗi đọc hash secret:", secretErr?.message);
    return Response.json({ error: "Cấu hình thanh toán chưa hoàn tất" }, { status: 500 });
  }

  // Mã giao dịch phải DUY NHẤT toàn hệ thống (VNPay yêu cầu). Dùng 8 ký tự
  // đầu của record id + timestamp — đủ ngắn, đủ tránh trùng, và vẫn truy
  // ngược được về khoản học phí khi đọc log thủ công.
  const vnpTxnRef = `${tuition_record_id.slice(0, 8)}-${Date.now()}`;

  const { data: txn, error: txnErr } = await admin
    .from("vnpay_transactions")
    .insert({
      tuition_record_id,
      vnp_txn_ref: vnpTxnRef,
      amount: outstanding,
      status: "pending",
    })
    .select("id")
    .single();

  if (txnErr) {
    console.error("[tuition/pay] lỗi tạo giao dịch:", txnErr.message);
    return Response.json({ error: "Không tạo được giao dịch" }, { status: 500 });
  }

  // IP người dùng — VNPay yêu cầu, và hữu ích khi cần tra soát gian lận.
  // Lấy từ header vì Vercel không expose request.ip trực tiếp.
  const ipAddr =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

  // Fallback giống send-org-email.js: NEXT_PUBLIC_APP_URL có thể chưa cấu
  // hình ở môi trường mới, VERCEL_URL luôn có sẵn trên Vercel.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const returnUrl = `${baseUrl}/api/tuition/vnpay-return`;

  let paymentUrl;
  try {
    paymentUrl = buildPaymentUrl(
      {
        tmnCode: config.tmn_code,
        hashSecret,
        paymentUrl: config.environment === "production" ? PRODUCTION_URL : SANDBOX_URL,
      },
      {
        amount: outstanding,
        orderId: vnpTxnRef,
        orderInfo: `Thanh toan hoc phi ${tuition_record_id.slice(0, 8)}`,
        ipAddr,
        returnUrl,
      }
    );
  } catch (e) {
    console.error("[tuition/pay] lỗi tạo URL thanh toán:", e.message);
    return Response.json({ error: "Không tạo được link thanh toán" }, { status: 500 });
  }

  return Response.json({ payment_url: paymentUrl, txn_id: txn.id, amount: outstanding });
}
