import test from "node:test";
import assert from "node:assert/strict";
import { loadBillingStatus, entitlementWriter, appConfigBody } from "../../src/lib/billing/status.js";

const NOW = new Date("2026-10-16T05:00:00Z");

function deps({ entitlement = null, usage = { advanced_translate: 2, dictionary: 3 }, saved = 12 } = {}) {
  const calls = [];
  return {
    calls,
    getEntitlement: async () => { calls.push("getEntitlement"); return entitlement; },
    usageToday: async () => { calls.push("usageToday"); return usage; },
    countSaved: async () => { calls.push("countSaved"); return saved; },
  };
}

test("status miễn phí: đếm lượt hôm nay + số từ đã lưu", async () => {
  const d = deps();
  const s = await loadBillingStatus({ deps: d, enforced: true, now: NOW });
  assert.equal(s.pro, false);
  assert.deepEqual(s.limits.advanced_translate, { used: 2, limit: 5 });
  assert.deepEqual(s.limits.dictionary, { used: 3, limit: 5 });
  assert.deepEqual(s.limits.saved_words, { used: 12, limit: 30 });
  assert.equal(s.has_active_subscription, false);
});

test("status Pro: không gọi hàm hạn mức (usage_today)", async () => {
  const d = deps({ entitlement: { source: "app_store", expires_at: "2026-11-16T00:00:00Z", auto_renew: true } });
  const s = await loadBillingStatus({ deps: d, enforced: true, now: NOW });
  assert.equal(s.pro, true);
  assert.equal(s.has_active_subscription, true);
  assert.ok(!d.calls.includes("usageToday"));
  assert.deepEqual(s.limits.advanced_translate, { used: 0, limit: null });
});

test("status khi tắt chặn: enforced false, limit null", async () => {
  const s = await loadBillingStatus({ deps: deps(), enforced: false, now: NOW });
  assert.equal(s.enforced, false);
  assert.equal(s.limits.saved_words.limit, null);
});

test("entitlementWriter: gọi apply_entitlement đủ tham số, lỗi DB ném kèm code", async () => {
  const seen = [];
  const ok = { rpc: async (fn, args) => { seen.push([fn, args]); return { data: "applied", error: null }; } };
  const row = { source: "app_store", product_id: "wordly.pro.monthly", original_transaction_id: "1", expires_at: "2026-11-01T00:00:00.000Z",
    in_grace: false, grace_expires_at: null, auto_renew: true, environment: "Sandbox", event_at: "2026-10-16T05:00:00.000Z" };
  assert.equal(await entitlementWriter(ok)("u1", row), "applied");
  assert.deepEqual(seen[0], ["apply_entitlement", {
    p_user_id: "u1", p_source: "app_store", p_product_id: "wordly.pro.monthly", p_original_transaction_id: "1",
    p_expires_at: "2026-11-01T00:00:00.000Z", p_in_grace: false, p_grace_expires_at: null, p_auto_renew: true,
    p_environment: "Sandbox", p_event_at: "2026-10-16T05:00:00.000Z",
  }]);
  const bad = { rpc: async () => ({ data: null, error: { code: "23503", message: "fk" } }) };
  await assert.rejects(entitlementWriter(bad)("u1", row), (e) => e.code === "23503");
});

test("app-config: min_build từ APP_MIN_BUILD, mặc định 0", () => {
  assert.equal(appConfigBody({}).min_build, 0);
  assert.equal(appConfigBody({ APP_MIN_BUILD: "21" }).min_build, 21);
});
