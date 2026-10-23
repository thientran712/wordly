// Callback SSV của AdMob (spec 2026-10-23-in-app-ads-design.md). CÔNG KHAI
// (Google gọi, không có phiên đăng nhập) — an toàn nhờ chữ ký ECDSA của
// Google; sai chữ ký → 400, không ghi gì. URL khai trên AdMob (ad unit thưởng):
//   https://app.wordly.skillproof.work/api/ads/reward-callback
import { createAdminClient } from "@/lib/supabase/admin";
import { adsConfig } from "@/lib/ads/config";
import { fetchVerifierKeys, handleRewardCallback } from "@/lib/ads/ssv";

export async function GET(request) {
  // Nội dung ký là query nguyên dạng mã hoá — lấy từ URL thô, không dựng lại
  const url = request.url;
  const q = url.indexOf("?");
  const rawQuery = q >= 0 ? url.slice(q + 1) : "";
  // Service role: không có người dùng; chỉ ghi SAU khi chữ ký Google đã đúng
  const admin = createAdminClient();
  const result = await handleRewardCallback({
    rawQuery,
    getKeys: fetchVerifierKeys,
    grant: async (args) => {
      const { data, error } = await admin.rpc("grant_ad_reward", args);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data;
    },
    rewardCredits: adsConfig().rewardCredits,
  });
  return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "no-store" } });
}
