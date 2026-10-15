// App Store Server Notifications V2 (spec 2026-10-16 §4, §6): gia hạn, huỷ,
// hoàn tiền, ân hạn. CÔNG KHAI (Apple gọi, không có phiên đăng nhập) — an toàn
// nhờ xác thực chữ ký JWS của Apple; sai chữ ký → 400, không ghi gì.
// URL khai trên App Store Connect (Production + Sandbox):
//   https://app.wordly.skillproof.work/api/billing/notifications
import { createAdminClient } from "@/lib/supabase/admin";
import { handleNotification } from "@/lib/billing/apple";
import { verifyApple } from "@/lib/billing/apple-verifier";
import { entitlementWriter } from "@/lib/billing/status";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  // Service role: webhook không có người dùng; chỉ ghi sau khi JWS đã xác thực
  const admin = createAdminClient();
  const result = await handleNotification({
    signedPayload: body?.signedPayload,
    verify: verifyApple,
    apply: entitlementWriter(admin),
    // Thông báo thiếu appAccountToken → tìm chủ gói theo original_transaction_id
    findUserByOtid: async (otid) => {
      const { data, error } = await admin.from("entitlements").select("user_id")
        .eq("original_transaction_id", otid).maybeSingle();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data?.user_id ?? null;
    },
  }).catch((e) => {
    console.error("[billing/notifications]", e.message);
    return { status: 500, body: { error: "Lỗi máy chủ" } };
  });
  return Response.json(result.body ?? { ok: true }, { status: result.status });
}
