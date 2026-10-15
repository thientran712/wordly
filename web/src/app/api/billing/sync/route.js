// App gửi signedTransactionInfo (StoreKit 2) sau khi mua / khôi phục / thấy
// Transaction.updates (spec 2026-10-16 §4, §8). Server tự xác thực chữ ký JWS
// của Apple — không tin app — rồi mới ghi quyền Pro.
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
// Service role CHỈ để gọi apply_entitlement (người dùng không có quyền ghi
// entitlements) — xem ADMIN_ALLOWED trong tests/unit/admin-client-usage.test.mjs.
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { syncTransaction } from "@/lib/billing/apple";
import { verifyApple } from "@/lib/billing/apple-verifier";
import { billingConfig } from "@/lib/billing/enforce";
import { createBillingDeps } from "@/lib/billing/store";
import { entitlementWriter, loadBillingStatus } from "@/lib/billing/status";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const shared = createSharedClient();
  const rl = await checkRateLimitDb({ supabase: shared, scope: "billing-sync", clientKey: user.id, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await request.json().catch(() => null);
  let result;
  try {
    result = await syncTransaction({
      signedTransaction: body?.signed_transaction,
      userId: user.id,
      verify: verifyApple,
      apply: entitlementWriter(createAdminClient()),
    });
  } catch (e) {
    console.error("[billing/sync] lỗi ghi:", e.message);
    return Response.json({ error: "Không đồng bộ được gói, thử lại sau" }, { status: 500 });
  }
  if (result.status !== 200) return Response.json(result.body, { status: result.status });

  // Trả trạng thái mới (hình như GET /api/billing/status)
  const deps = createBillingDeps({ supabase: await createClient(), sharedSupabase: shared, userId: user.id });
  const status = await loadBillingStatus({ deps, enforced: billingConfig(process.env, user.id).enforced });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
