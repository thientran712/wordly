// Trạng thái Wordly Pro + bộ đếm hôm nay (spec 2026-10-16 §8). Đọc bằng client
// người dùng (RLS): chỉ thấy entitlements / usage của chính mình.
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { billingConfig } from "@/lib/billing/enforce";
import { createBillingDeps } from "@/lib/billing/store";
import { loadBillingStatus } from "@/lib/billing/status";
import { buildFromHeader } from "@/lib/admin/activity";
import { adsConfig, adsApplyToBuild } from "@/lib/ads/config";

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  // App gọi route này mỗi lần mở / quay lại app → ghi ngày hoạt động cho thống kê
  // (spec 2026-10-16-admin-stats-design.md). Lỗi ghi không ảnh hưởng trạng thái gói.
  const touch = supabase.rpc("touch_activity", { p_build: buildFromHeader(request?.headers?.get("x-wordly-build")) })
    .then(({ error }) => { if (error) console.error("[billing/status] touch_activity", error.message); })
    .catch((e) => console.error("[billing/status] touch_activity", e.message));
  const deps = createBillingDeps({ supabase, sharedSupabase: createSharedClient(), userId: user.id });
  try {
    // Quảng cáo: chỉ bản app có quảng cáo (build ≥ ADS_MIN_BUILD) bị tính lượt dịch
    const ads = adsConfig();
    const status = await loadBillingStatus({
      deps, enforced: billingConfig(process.env, user.id).enforced,
      ads: { enforced: ads.enforced && adsApplyToBuild(request?.headers?.get("x-wordly-build"), ads.minBuild), dailyFree: ads.dailyFree },
    });
    await touch;
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[billing/status]", e.message);
    return Response.json({ error: "Không tải được trạng thái gói" }, { status: 500 });
  }
}
