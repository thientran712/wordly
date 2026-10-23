// Cấu hình quảng cáo (spec 2026-10-23-in-app-ads-design.md): env → luật lượt
// dịch phía server + cấu hình hiển thị quảng cáo gửi app qua /api/app-config.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adsConfig, adsApplyToBuild, adsAppConfig } from "../../src/lib/ads/config.js";
import { appConfigBody } from "../../src/lib/billing/status.js";

test("adsConfig: mặc định tắt, 10 lượt miễn phí, thưởng 10 lượt", () => {
  assert.deepEqual(adsConfig({}), { enforced: false, dailyFree: 10, rewardCredits: 10, minBuild: 0 });
});

test("adsConfig: đọc env, số không hợp lệ về mặc định", () => {
  assert.equal(adsConfig({ ADS_ENFORCE: " On " }).enforced, true);
  assert.equal(adsConfig({ ADS_ENFORCE: "0" }).enforced, false);
  assert.equal(adsConfig({ ADS_DAILY_FREE: "abc" }).dailyFree, 10);
  assert.equal(adsConfig({ ADS_DAILY_FREE: "-3" }).dailyFree, 10);
  assert.equal(adsConfig({ ADS_DAILY_FREE: "0" }).dailyFree, 0);
  assert.equal(adsConfig({ ADS_REWARD_CREDITS: "5" }).rewardCredits, 5);
  assert.equal(adsConfig({ ADS_MIN_BUILD: "23" }).minBuild, 23);
});

test("adsApplyToBuild: chỉ áp cho bản app có quảng cáo", () => {
  assert.equal(adsApplyToBuild("23", 23), true);
  assert.equal(adsApplyToBuild("30", 23), true);
  assert.equal(adsApplyToBuild("22", 23), false);
  assert.equal(adsApplyToBuild(undefined, 23), false);
  assert.equal(adsApplyToBuild("abc", 23), false);
  assert.equal(adsApplyToBuild("23", 0), false);
});

test("adsAppConfig: mặc định", () => {
  assert.deepEqual(adsAppConfig({}), {
    enabled: false, app_open_per_day: 2, interstitial_min_gap_sec: 180, interstitial_per_day: 6,
    banner: true, grace_hours: 0, premium_theme_ids: [],
  });
});

test("adsAppConfig: đọc env", () => {
  const c = adsAppConfig({ ADS_ENABLED: "yes", ADS_BANNER: "0", ADS_APP_OPEN_PER_DAY: "1", ADS_PREMIUM_THEMES: " a, b ,," });
  assert.equal(c.enabled, true);
  assert.equal(c.banner, false);
  assert.equal(c.app_open_per_day, 1);
  assert.deepEqual(c.premium_theme_ids, ["a", "b"]);
});

test("appConfigBody: kèm min_build + ads", () => {
  const body = appConfigBody({ APP_MIN_BUILD: "22" });
  assert.equal(body.min_build, 22);
  assert.deepEqual(body.ads, adsAppConfig({}));
});
