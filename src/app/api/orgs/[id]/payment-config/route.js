// GET   /api/orgs/[id]/payment-config — xem cấu hình VNPay (KHÔNG bao giờ
//                                        trả hash secret ra client)
// PUT   /api/orgs/[id]/payment-config — lưu/cập nhật TMN Code + Hash Secret
//
// Chỉ owner cấu hình — đây là thông tin tài chính nhạy cảm nhất trong hệ
// thống. Hash Secret không bao giờ đi qua tay client sau khi lưu: route
// PUT nhận nó một lần để lưu vào Vault (mã hoá), route GET không trả lại.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid, requireOwner } from "@/lib/org-context";

export async function GET(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  // Chỉ select cột KHÔNG nhạy cảm — hash_secret_id chỉ là con trỏ tới
  // Vault, không phải secret thật, nhưng vẫn không cần lộ ra client.
  const { data, error } = await supabase
    .from("org_payment_configs")
    .select("provider, tmn_code, environment, enabled, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("[payment-config] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được cấu hình thanh toán" }, { status: 500 });
  }

  return Response.json({
    config: data || null,
    // Cho UI biết đã cấu hình Hash Secret chưa mà không lộ giá trị
    has_hash_secret: !!data,
  });
}

export async function PUT(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { tmn_code, hash_secret, environment, enabled } = body || {};

  const cleanTmnCode = (tmn_code || "").trim();
  if (!cleanTmnCode || cleanTmnCode.length > 50) {
    return Response.json({ error: "TMN Code phải từ 1 đến 50 ký tự" }, { status: 400 });
  }

  if (!["sandbox", "production"].includes(environment)) {
    return Response.json({ error: "environment phải là 'sandbox' hoặc 'production'" }, { status: 400 });
  }

  // hash_secret CHỈ bắt buộc khi lần đầu cấu hình hoặc muốn đổi. Cho phép
  // để trống khi chỉ sửa tmn_code/environment — không bắt owner nhập lại
  // secret mỗi lần đổi thứ khác.
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: existing } = await supabase
    .from("org_payment_configs")
    .select("org_id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!existing && !hash_secret) {
    return Response.json({ error: "Cần nhập Hash Secret khi cấu hình lần đầu" }, { status: 400 });
  }

  // enabled: chỉ nhận boolean tường minh, không suy đoán từ giá trị khác —
  // bật thanh toán online là quyết định của owner, không phải hệ quả phụ
  // của việc lưu tmn_code.
  const enabledValue = typeof enabled === "boolean" ? enabled : (existing ? undefined : false);

  const upsertPayload = { org_id: orgId, tmn_code: cleanTmnCode, environment, provider: "vnpay" };
  if (enabledValue !== undefined) upsertPayload.enabled = enabledValue;

  // Upsert metadata trước (RLS đảm bảo chỉ owner ghi được)
  const { error: upsertErr } = await supabase
    .from("org_payment_configs")
    .upsert(upsertPayload, { onConflict: "org_id" });

  if (upsertErr) {
    console.error("[payment-config] PUT upsert lỗi:", upsertErr.message);
    return Response.json({ error: "Không lưu được cấu hình" }, { status: 500 });
  }

  // Nếu có hash_secret mới, lưu qua RPC (mã hoá trong Vault). RPC tự kiểm
  // quyền owner lần nữa ở tầng DB — phòng vệ kép.
  if (hash_secret) {
    if (String(hash_secret).trim().length < 8) {
      return Response.json({ error: "Hash Secret phải có ít nhất 8 ký tự" }, { status: 400 });
    }
    const { error: secretErr } = await admin.rpc("set_vnpay_secret", {
      p_org_id: orgId,
      p_hash_secret: String(hash_secret).trim(),
    });
    if (secretErr) {
      console.error("[payment-config] lưu hash secret lỗi:", secretErr.message);
      return Response.json({ error: "Không lưu được Hash Secret" }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}
