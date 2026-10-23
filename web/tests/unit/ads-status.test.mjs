// Trạng thái quảng cáo trong GET /api/billing/status (spec 2026-10-23): app
// hiện bộ đếm lượt dịch, biết có bị quảng cáo không, theme nào đã mở khoá.
import test from "node:test";
import assert from "node:assert/strict";
import { loadBillingStatus } from "../../src/lib/billing/status.js";
import { adFallbackResponse } from "../../src/lib/ads/enforce.js";

const NOW = new Date("2026-10-23T05:00:00Z");
const ADS = { enforced: true, dailyFree: 10 };

function deps({ entitlement = null, today = { used: 4, credits: 7 }, themes = ["space_1"], todayError = false } = {}) {
  const calls = [];
  return {
    calls,
    getEntitlement: async () => { calls.push("getEntitlement"); return entitlement; },
    usageToday: async () => ({ advanced_translate: 0, dictionary: 0 }),
    countSaved: async () => 0,
    translateToday: async () => {
      calls.push("translateToday");
      if (todayError) throw new Error("db down");
      return today;
    },
    unlockedThemes: async () => { calls.push("unlockedThemes"); return themes; },
  };
}

test("người dùng thường: bộ đếm lượt dịch + theme đã mở", async () => {
  const s = await loadBillingStatus({ deps: deps(), enforced: false, ads: ADS, now: NOW });
  assert.deepEqual(s.ads, {
    ad_free: false,
    translate: { used_today: 4, free_daily: 10, credits: 7, enforced: true },
    unlocked_theme_ids: ["space_1"],
  });
});

test("Pro / được tặng: không quảng cáo, không đọc lượt dịch", async () => {
  const d = deps({ entitlement: { source: "gift", expires_at: null } });
  const s = await loadBillingStatus({ deps: d, enforced: false, ads: ADS, now: NOW });
  assert.equal(s.ads.ad_free, true);
  assert.equal(s.ads.translate, null);
  assert.ok(!d.calls.includes("translateToday"));
});

test("đọc lượt dịch / theme lỗi → trạng thái vẫn trả", async () => {
  const d = deps({ todayError: true });
  d.unlockedThemes = async () => { throw new Error("db down"); };
  const s = await loadBillingStatus({ deps: d, enforced: false, ads: ADS, now: NOW });
  assert.equal(s.ads.translate, null);
  assert.deepEqual(s.ads.unlocked_theme_ids, []);
  assert.equal(s.pro, false);
});

test("không truyền ads (server cũ gọi) → không có khối ads", async () => {
  const s = await loadBillingStatus({ deps: deps(), enforced: false, now: NOW });
  assert.equal(s.ads, undefined);
});

test("POST /api/ads/fallback: khách → 401", async () => {
  const r = await adFallbackResponse({ user: null, deps: null });
  assert.equal(r.status, 401);
});

test("POST /api/ads/fallback: cấp lượt dự phòng", async () => {
  const r = await adFallbackResponse({ user: { id: "u" }, deps: { grantAdFallback: async () => ({ granted: true, credits: 3 }) } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { granted: true, credits: 3 });
});

test("POST /api/ads/fallback: DB lỗi → 500", async () => {
  const r = await adFallbackResponse({ user: { id: "u" }, deps: { grantAdFallback: async () => { throw new Error("x"); } } });
  assert.equal(r.status, 500);
});
