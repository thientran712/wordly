import test from "node:test";
import assert from "node:assert/strict";
import { validateDeviceBody, validatePreferencesBody } from "../../src/lib/push/validate.js";

const tok = "a".repeat(120) + ":APA91b_-x";

test("device: token FCM hợp lệ, platform mặc định ios", () => {
  assert.deepEqual(validateDeviceBody({ token: tok, app_version: "1.0.0 (16)" }),
    { ok: true, value: { token: tok, platform: "ios", app_version: "1.0.0 (16)" } });
});

test("device: token ngắn/ký tự lạ/không phải chuỗi → lỗi", () => {
  for (const token of ["abc", "a".repeat(99), "a".repeat(120) + " x", "a".repeat(120) + "<", 123, null]) {
    assert.equal(validateDeviceBody({ token }).ok, false, String(token));
  }
});

test("device: platform lạ, app_version quá dài → lỗi", () => {
  assert.equal(validateDeviceBody({ token: tok, platform: "web" }).ok, false);
  assert.equal(validateDeviceBody({ token: tok, app_version: "x".repeat(33) }).ok, false);
  assert.equal(validateDeviceBody(null).ok, false);
});

test("preferences: hợp lệ → custom_days bỏ trùng + sắp xếp", () => {
  assert.deepEqual(validatePreferencesBody({ enabled: true, frequency: "custom", custom_days: [5, 1, 1] }),
    { ok: true, value: { enabled: true, frequency: "custom", custom_days: [1, 5] } });
});

test("preferences: sai kiểu → lỗi", () => {
  assert.equal(validatePreferencesBody({ enabled: "yes", frequency: "daily", custom_days: [1] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "hourly", custom_days: [1] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [7] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [1.5] }).ok, false);
});
