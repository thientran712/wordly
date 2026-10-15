// Gom cấu hình + deps billing cho một request của route người dùng.
// Chỉ tạo client DB khi BILLING_ENFORCE bật và có người dùng — tắt chặn thì
// route chạy y như hôm nay, không thêm truy vấn nào.
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { billingConfig } from "./enforce.js";
import { createBillingDeps } from "./store.js";

export async function billingForRequest(request, user) {
  const config = billingConfig();
  // App từ build có paywall gửi số build mọi request (spec §8)
  const build = request.headers.get("x-wordly-build");
  const deps = config.enforced && user
    ? createBillingDeps({ supabase: await createClient(), sharedSupabase: createSharedClient(), userId: user.id })
    : null;
  return { config, build, deps };
}
