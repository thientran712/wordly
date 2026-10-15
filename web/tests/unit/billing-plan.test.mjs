import test from "node:test";
import assert from "node:assert/strict";
import {
  FREE_LIMITS, PRO_LIMITS, PRO_ABUSE_CAPS, isPro, effectiveExpiry, requiresUpdate,
  billingEnforced, appMinBuild, limitsFor, buildStatus, limitBody, UPDATE_REQUIRED_BODY, hasActiveSubscription,
} from "../../src/lib/billing/plan.js";

const NOW = new Date("2026-10-16T05:00:00Z");
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();
const DAY = 86_400_000;

test("giới hạn theo gói đúng spec §1", () => {
  assert.deepEqual(FREE_LIMITS, { saved_words: 30, advanced_translate: 5, dictionary: 5, push_slots: 1 });
  assert.deepEqual(PRO_LIMITS, { saved_words: null, advanced_translate: null, dictionary: null, push_slots: 10 });
  assert.deepEqual(PRO_ABUSE_CAPS, { sentence: 200, image: 30, voice: 50 });
});

test("isPro: không có dòng → miễn phí", () => {
  assert.equal(isPro(null, NOW), false);
  assert.equal(isPro(undefined, NOW), false);
});

test("isPro: còn hạn / hết hạn theo giờ server", () => {
  assert.equal(isPro({ source: "app_store", expires_at: iso(DAY) }, NOW), true);
  assert.equal(isPro({ source: "app_store", expires_at: iso(-1) }, NOW), false);
  assert.equal(isPro({ source: "app_store", expires_at: iso(0) }, NOW), false, "đúng mốc hết hạn = hết");
});

test("isPro: ân hạn thanh toán giữ Pro tới khi hết ân hạn", () => {
  const e = { source: "app_store", expires_at: iso(-DAY), in_grace: true, grace_expires_at: iso(DAY) };
  assert.equal(isPro(e, NOW), true);
  assert.equal(isPro({ ...e, grace_expires_at: iso(-1) }, NOW), false);
  assert.equal(isPro({ ...e, in_grace: false }, NOW), false, "hết cờ ân hạn → hết Pro");
});

test("isPro: gift không hạn = Pro, app_store không hạn = KHÔNG Pro", () => {
  assert.equal(isPro({ source: "gift", expires_at: null }, NOW), true);
  assert.equal(isPro({ source: "app_store", expires_at: null }, NOW), false);
});

test("effectiveExpiry: trong ân hạn trả mốc hết ân hạn", () => {
  assert.equal(effectiveExpiry({ expires_at: iso(DAY), in_grace: false }), iso(DAY));
  assert.equal(effectiveExpiry({ expires_at: iso(-DAY), in_grace: true, grace_expires_at: iso(DAY) }), iso(DAY));
  assert.equal(effectiveExpiry(null), null);
});

test("requiresUpdate: tắt chặn → không bao giờ bắt cập nhật", () => {
  assert.equal(requiresUpdate(null, 21, false), false);
  assert.equal(requiresUpdate("5", 21, false), false);
});

test("requiresUpdate: bật chặn → thiếu header / build cũ / rác → bắt cập nhật", () => {
  assert.equal(requiresUpdate(null, 0, true), true, "build 19/20 không gửi header");
  assert.equal(requiresUpdate("", 0, true), true);
  assert.equal(requiresUpdate("abc", 0, true), true);
  assert.equal(requiresUpdate("20", 21, true), true);
  assert.equal(requiresUpdate("21", 21, true), false);
  assert.equal(requiresUpdate(" 25 ", 21, true), false);
  assert.equal(requiresUpdate("21", 0, true), false);
});

test("billingEnforced: mặc định tắt, chỉ bật khi đặt rõ", () => {
  assert.equal(billingEnforced({}), false);
  assert.equal(billingEnforced({ BILLING_ENFORCE: "" }), false);
  assert.equal(billingEnforced({ BILLING_ENFORCE: "0" }), false);
  assert.equal(billingEnforced({ BILLING_ENFORCE: "false" }), false);
  for (const v of ["1", "true", "on", "TRUE"]) assert.equal(billingEnforced({ BILLING_ENFORCE: v }), true, v);
});

test("appMinBuild: mặc định 0, số nguyên không âm", () => {
  assert.equal(appMinBuild({}), 0);
  assert.equal(appMinBuild({ APP_MIN_BUILD: "21" }), 21);
  assert.equal(appMinBuild({ APP_MIN_BUILD: "x" }), 0);
  assert.equal(appMinBuild({ APP_MIN_BUILD: "-3" }), 0);
});

test("limitsFor: tắt chặn → không giới hạn (push 10); miễn phí / Pro", () => {
  assert.deepEqual(limitsFor({ pro: false, enforced: false }), PRO_LIMITS);
  assert.deepEqual(limitsFor({ pro: false, enforced: true }), FREE_LIMITS);
  assert.deepEqual(limitsFor({ pro: true, enforced: true }), PRO_LIMITS);
});

test("buildStatus: miễn phí, đang chặn — đúng hình §8", () => {
  const s = buildStatus({ entitlement: null, usage: { advanced_translate: 2, dictionary: 1 }, savedCount: 24, enforced: true, now: NOW });
  assert.deepEqual(s, {
    pro: false, expires_at: null, source: null, in_grace: false, enforced: true, has_active_subscription: false,
    limits: {
      saved_words: { used: 24, limit: 30 },
      advanced_translate: { used: 2, limit: 5 },
      dictionary: { used: 1, limit: 5 },
      push_slots: { limit: 1 },
    },
  });
});

test("buildStatus: Pro đang ân hạn — expires_at là mốc hết ân hạn", () => {
  const e = { source: "app_store", expires_at: iso(-DAY), in_grace: true, grace_expires_at: iso(DAY), auto_renew: true };
  const s = buildStatus({ entitlement: e, usage: {}, savedCount: 100, enforced: true, now: NOW });
  assert.equal(s.pro, true);
  assert.equal(s.in_grace, true);
  assert.equal(s.expires_at, iso(DAY));
  assert.equal(s.source, "app_store");
  assert.equal(s.has_active_subscription, true);
  assert.deepEqual(s.limits.saved_words, { used: 100, limit: null });
  assert.deepEqual(s.limits.advanced_translate, { used: 0, limit: null });
  assert.deepEqual(s.limits.push_slots, { limit: 10 });
});

test("buildStatus: tắt chặn → enforced false, mọi limit null, push 10", () => {
  const s = buildStatus({ entitlement: null, usage: { advanced_translate: 9 }, savedCount: 3, enforced: false, now: NOW });
  assert.equal(s.enforced, false);
  assert.deepEqual(s.limits, {
    saved_words: { used: 3, limit: null }, advanced_translate: { used: 9, limit: null },
    dictionary: { used: 0, limit: null }, push_slots: { limit: 10 },
  });
});

test("buildStatus: hết hạn → không Pro, không còn thuê bao hoạt động", () => {
  const e = { source: "app_store", expires_at: iso(-DAY), in_grace: false, auto_renew: false };
  const s = buildStatus({ entitlement: e, usage: {}, savedCount: 0, enforced: true, now: NOW });
  assert.equal(s.pro, false);
  assert.equal(s.expires_at, iso(-DAY));
  assert.equal(s.has_active_subscription, false);
});

test("hasActiveSubscription: chỉ app_store còn hạn và chưa tắt tự gia hạn", () => {
  const e = { source: "app_store", expires_at: iso(DAY), auto_renew: true };
  assert.equal(hasActiveSubscription(e, NOW), true);
  assert.equal(hasActiveSubscription({ ...e, auto_renew: null }, NOW), true, "chưa biết → cảnh báo cho chắc");
  assert.equal(hasActiveSubscription({ ...e, auto_renew: false }, NOW), false, "đã tắt tự gia hạn → không bị trừ tiền nữa");
  assert.equal(hasActiveSubscription({ source: "gift", expires_at: null }, NOW), false);
  assert.equal(hasActiveSubscription(null, NOW), false);
});

test("limitBody / UPDATE_REQUIRED_BODY đúng hợp đồng §8", () => {
  for (const code of ["limit_saved_words", "limit_advanced_translate", "limit_dictionary", "limit_push_slots"]) {
    const b = limitBody(code, 5);
    assert.equal(b.code, code);
    assert.equal(b.limit, 5);
    assert.equal(typeof b.error, "string");
    assert.ok(b.error.length > 10);
  }
  assert.deepEqual(UPDATE_REQUIRED_BODY, {
    error: "Phiên bản Wordly này đã cũ, hãy cập nhật trên App Store để tiếp tục.",
    code: "update_required",
  });
});
