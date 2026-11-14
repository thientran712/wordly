// Quảng cáo mở app (chủ dự án chốt 11/11/2026): chỉ một loại quảng cáo — mở app
// lạnh, tối đa ADS_APP_OPEN_PER_DAY lần/ngày. Server chỉ là công tắc + tần suất
// gửi app qua /api/app-config, cộng /app-ads.txt cho AdMob đối chiếu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { adsAppConfig, appAdsTxt } from "../../src/lib/ads/config.js";
import { appConfigBody } from "../../src/lib/billing/status.js";

test("adsAppConfig: mặc định TẮT, 1 lần/ngày, không giãn cách", () => {
  assert.deepEqual(adsAppConfig({}), { enabled: false, app_open_per_day: 1, app_open_min_gap_minutes: 0 });
});

test("adsAppConfig: khoảng cách giữa 2 lần (chủ dự án chốt 14/11: 3 lần/ngày, cách 180 phút)", () => {
  const c = adsAppConfig({ ADS_ENABLED: "1", ADS_APP_OPEN_PER_DAY: "3", ADS_APP_OPEN_MIN_GAP_MINUTES: "180" });
  assert.deepEqual(c, { enabled: true, app_open_per_day: 3, app_open_min_gap_minutes: 180 });
  assert.equal(adsAppConfig({ ADS_APP_OPEN_MIN_GAP_MINUTES: "x" }).app_open_min_gap_minutes, 0);
});

test("adsAppConfig: đọc env, số sai về mặc định", () => {
  assert.deepEqual(adsAppConfig({ ADS_ENABLED: " On ", ADS_APP_OPEN_PER_DAY: "2" }), { enabled: true, app_open_per_day: 2, app_open_min_gap_minutes: 0 });
  assert.equal(adsAppConfig({ ADS_ENABLED: "0" }).enabled, false);
  assert.equal(adsAppConfig({ ADS_ENABLED: "abc" }).enabled, false);
  assert.equal(adsAppConfig({ ADS_APP_OPEN_PER_DAY: "-1" }).app_open_per_day, 1);
  assert.equal(adsAppConfig({ ADS_APP_OPEN_PER_DAY: "x" }).app_open_per_day, 1);
  assert.equal(adsAppConfig({ ADS_APP_OPEN_PER_DAY: "0" }).app_open_per_day, 0);
});

test("appConfigBody: kèm min_build + ads", () => {
  const body = appConfigBody({ APP_MIN_BUILD: "22", ADS_ENABLED: "1" });
  assert.equal(body.min_build, 22);
  assert.deepEqual(body.ads, { enabled: true, app_open_per_day: 1, app_open_min_gap_minutes: 0 });
});

test("app-ads.txt: một dòng của Google theo ADMOB_PUBLISHER_ID, thiếu/sai env → null", () => {
  assert.equal(appAdsTxt({ ADMOB_PUBLISHER_ID: " pub-123 " }), "google.com, pub-123, DIRECT, f08c47fec0942fa0\n");
  assert.equal(appAdsTxt({}), null);
  assert.equal(appAdsTxt({ ADMOB_PUBLISHER_ID: "pub-1\ninjected" }), null);
});
