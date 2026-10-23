// Trạng thái gói cho app (GET /api/billing/status, POST /api/billing/sync) +
// ghi quyền Pro bằng service role + cấu hình app công khai. Spec 2026-10-16 §8.
import { isPro, buildStatus, appMinBuild } from "./plan.js";
import { adsAppConfig } from "../ads/config.js";

/**
 * Hình §8 + has_active_subscription. `deps` từ createBillingDeps (client
 * người dùng, RLS). Pro → không gọi usage_today (Pro không dùng hàm hạn mức).
 */
export async function loadBillingStatus({ deps, enforced, ads, now = new Date() }) {
  const entitlement = await deps.getEntitlement();
  const pro = isPro(entitlement, now);
  const [usage, savedCount, adsBlock] = await Promise.all([
    pro ? {} : deps.usageToday(), deps.countSaved(), ads ? loadAdsStatus({ deps, pro, ads }) : undefined,
  ]);
  const status = buildStatus({ entitlement, usage, savedCount, enforced, now });
  return adsBlock ? { ...status, ads: adsBlock } : status;
}

/**
 * Khối `ads` (spec 2026-10-23): `ads` = { enforced (đã xét build), dailyFree }.
 * Pro/được tặng → không quảng cáo, không đọc lượt. Lỗi đọc → không chặn
 * trạng thái gói: lượt dịch null, theme rỗng.
 */
async function loadAdsStatus({ deps, pro, ads }) {
  const soft = (p, fallback, what) => p.catch((e) => {
    console.error(`[billing/status] ${what}`, e?.message || e);
    return fallback;
  });
  const [today, themes] = await Promise.all([
    pro ? null : soft(deps.translateToday(), null, "translateToday"),
    soft(deps.unlockedThemes(), [], "unlockedThemes"),
  ]);
  return {
    ad_free: pro,
    translate: today ? {
      used_today: today.used ?? 0, free_daily: ads.dailyFree, credits: today.credits ?? 0, enforced: !!ads.enforced,
    } : null,
    unlocked_theme_ids: themes ?? [],
  };
}

/**
 * (userId, row) → 'applied' | 'stale' | 'other_account' qua hàm SQL
 * apply_entitlement (chỉ service role gọi được). Lỗi DB ném kèm `code`
 * Postgres để webhook phân biệt người dùng đã xoá (23503).
 */
export function entitlementWriter(adminClient) {
  return async (userId, row) => {
    const { data, error } = await adminClient.rpc("apply_entitlement", {
      p_user_id: userId, p_source: row.source, p_product_id: row.product_id,
      p_original_transaction_id: row.original_transaction_id, p_expires_at: row.expires_at,
      p_in_grace: row.in_grace, p_grace_expires_at: row.grace_expires_at, p_auto_renew: row.auto_renew,
      p_environment: row.environment, p_event_at: row.event_at,
    });
    if (error) throw Object.assign(new Error(`apply_entitlement: ${error.message}`), { code: error.code });
    return data;
  };
}

/** GET /api/app-config (công khai): build tối thiểu (dưới mức → "Cập nhật
 *  Wordly") + cấu hình hiển thị quảng cáo. */
export function appConfigBody(env = process.env) {
  return { min_build: appMinBuild(env), ads: adsAppConfig(env) };
}
