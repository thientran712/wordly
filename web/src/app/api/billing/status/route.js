// Trạng thái Wordly Pro + bộ đếm hôm nay (spec 2026-10-16 §8). Đọc bằng client
// người dùng (RLS): chỉ thấy entitlements / usage của chính mình.
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { billingConfig } from "@/lib/billing/enforce";
import { createBillingDeps } from "@/lib/billing/store";
import { loadBillingStatus } from "@/lib/billing/status";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const deps = createBillingDeps({ supabase: await createClient(), sharedSupabase: createSharedClient(), userId: user.id });
  try {
    const status = await loadBillingStatus({ deps, enforced: billingConfig(process.env, user.id).enforced });
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[billing/status]", e.message);
    return Response.json({ error: "Không tải được trạng thái gói" }, { status: 500 });
  }
}
