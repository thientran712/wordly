// Chặn lượt dịch theo quảng cáo (spec 2026-10-23-in-app-ads-design.md).
//
// Mọi lần dịch (từ, câu, giọng nói, ảnh; kể cả trúng cache) của người đã đăng
// nhập trên bản app có quảng cáo tính một lượt: hết lượt miễn phí trong ngày
// thì trừ lượt thưởng, hết cả hai → 402 mời xem quảng cáo.
// Giữ lượt TRƯỚC khi gọi AI (một hàm SQL nguyên tử) — kiểm trước, trừ sau thì
// nhiều request song song khi còn 1 lượt đều được dịch. Dịch lỗi / app huỷ →
// hoàn lượt bằng phiếu. Tắt chặn → y như cũ; DB lỗi → cho qua (rate limit vẫn
// chặn thô); Pro/được tặng → không giới hạn.
import { isPro } from "../billing/plan.js";
import { normalizeQuotaKey } from "../billing/enforce.js";
import { adsApplyToBuild } from "./config.js";

export function translateLimitBody(dailyFree, rewardCredits) {
  return {
    error: `Bạn đã dùng hết lượt dịch hôm nay. Xem một quảng cáo ngắn để nhận thêm ${rewardCredits} lượt.`,
    code: "limit_translate",
    limit: dailyFree,
    ad_available: true,
  };
}

const isSuccess = (res, signal) => res && res.status >= 200 && res.status < 300 && !signal?.aborted;

function logFail(where, e) {
  console.error(`[ads] ${where} lỗi, cho qua:`, e?.message || e);
}

/** `config` = adsConfig(); `quotaKey` undefined cho ảnh (mỗi ảnh một lượt). */
export async function withTranslateQuota({ config, user, build, quotaKey: rawKey, deps, now = new Date(), signal }, run) {
  if (!config?.enforced || !user || !deps || !adsApplyToBuild(build, config.minBuild)) return run();

  try {
    if (isPro(await deps.getEntitlement(), now)) return run();
  } catch (e) {
    logFail("getEntitlement", e);
    return run();
  }

  const quotaKey = normalizeQuotaKey("translate", rawKey);
  let charge;
  try {
    charge = await deps.consumeTranslate(config.dailyFree, quotaKey);
  } catch (e) {
    logFail("consumeTranslate", e);
    return run();
  }
  if (!charge?.allowed) {
    return Response.json(translateLimitBody(config.dailyFree, config.rewardCredits), { status: 402 });
  }

  const res = await run();
  if (!isSuccess(res, signal) && charge.charge_id) {
    try {
      await deps.refundTranslate(charge.charge_id);
    } catch (e) {
      logFail("refundTranslate", e);
    }
  }
  return res;
}

/**
 * POST /api/ads/fallback: quảng cáo không tải được hoặc callback SSV chưa tới
 * sau 10 giây → cấp 1 lượt dự phòng (tối đa 5/ngày, hàm SQL giữ trần).
 */
export async function adFallbackResponse({ user, deps }) {
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await deps.grantAdFallback();
    return Response.json({ granted: !!r?.granted, credits: r?.credits ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[ads/fallback]", e?.message || e);
    return Response.json({ error: "Lỗi máy chủ" }, { status: 500 });
  }
}
