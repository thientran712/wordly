// Lượt dự phòng khi quảng cáo thưởng không tải được / SSV tới trễ (spec
// 2026-10-23). Client người dùng (RLS): grant_ad_fallback lấy auth.uid().
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { createBillingDeps } from "@/lib/billing/store";
import { adFallbackResponse } from "@/lib/ads/enforce";

export async function POST() {
  const user = await getUserFast();
  const deps = user
    ? createBillingDeps({ supabase: await createClient(), sharedSupabase: createSharedClient(), userId: user.id })
    : null;
  return adFallbackResponse({ user, deps });
}
