import test from "node:test";
import assert from "node:assert/strict";
import { createBillingDeps, vnDayShiftMs } from "../../src/lib/billing/store.js";

// Supabase giả: ghi lại from/eq/is/rpc, trả dữ liệu cấu hình sẵn.
function fakeSb({ rows = {}, counts = {}, rpc = {} } = {}) {
  const log = [];
  return {
    log,
    from(table) {
      const q = { table, filters: [] };
      const api = {
        select(_cols, opts) { q.head = opts?.head; return api; },
        eq(c, v) { q.filters.push(["eq", c, v]); return api; },
        is(c, v) { q.filters.push(["is", c, v]); return api; },
        maybeSingle() { log.push(["maybeSingle", table, q.filters]); return Promise.resolve({ data: rows[table] ?? null, error: null }); },
        then(resolve) { log.push(["count", table, q.filters]); return Promise.resolve({ count: counts[table] ?? 0, error: null }).then(resolve); },
      };
      return api;
    },
    rpc(name, args) { log.push(["rpc", name, args]); return Promise.resolve({ data: rpc[name] ?? null, error: null }); },
  };
}

test("getEntitlement: đọc đúng người, nhớ kết quả trong một request", async () => {
  const sb = fakeSb({ rows: { entitlements: { source: "gift", expires_at: null } } });
  const deps = createBillingDeps({ supabase: sb, sharedSupabase: sb, userId: "u1" });
  assert.deepEqual(await deps.getEntitlement(), { source: "gift", expires_at: null });
  await deps.getEntitlement();
  assert.equal(sb.log.filter((l) => l[0] === "maybeSingle").length, 1);
  assert.deepEqual(sb.log[0][2], [["eq", "user_id", "u1"]]);
});

test("usageToday / consume gọi đúng RPC + tham số", async () => {
  const sb = fakeSb({ rpc: { usage_today: { dictionary: 2 }, consume_quota: { allowed: true } } });
  const deps = createBillingDeps({ supabase: sb, sharedSupabase: sb, userId: "u1" });
  assert.deepEqual(await deps.usageToday("word"), { dictionary: 2 });
  await deps.usageToday();
  await deps.consume("dictionary", 5, "word");
  await deps.consume("advanced_translate", 5);
  await deps.usageToday(undefined, "k1");
  await deps.consume("advanced_translate", 5, undefined, "k1");
  assert.deepEqual(sb.log.map((l) => l.slice(1)), [
    ["usage_today", { p_word_key: "word" }],
    ["usage_today", {}],
    ["consume_quota", { p_kind: "dictionary", p_limit: 5, p_word_key: "word" }],
    ["consume_quota", { p_kind: "advanced_translate", p_limit: 5, p_word_key: null }],
    ["usage_today", { p_quota_key: "k1" }],
    ["consume_quota", { p_kind: "advanced_translate", p_limit: 5, p_word_key: null, p_quota_key: "k1" }],
  ]);
});

test("countSaved: chỉ từ đã lưu chưa xoá mềm; countEnabledSlots: khung đang bật", async () => {
  const sb = fakeSb({ counts: { translate_history: 31, push_slots: 2 } });
  const deps = createBillingDeps({ supabase: sb, sharedSupabase: sb, userId: "u1" });
  assert.equal(await deps.countSaved(), 31);
  assert.equal(await deps.countEnabledSlots(), 2);
  assert.deepEqual(sb.log[0], ["count", "translate_history", [["eq", "user_id", "u1"], ["eq", "is_saved", true], ["is", "deleted_at", null]]]);
  assert.deepEqual(sb.log[1], ["count", "push_slots", [["eq", "user_id", "u1"], ["eq", "enabled", true]]]);
});

test("bumpProCap: bộ đếm theo ngày giờ VN, tách theo loại", async () => {
  const sb = fakeSb({ rpc: { bump_rate_limit: 31 } });
  const deps = createBillingDeps({ supabase: sb, sharedSupabase: sb, userId: "u1", now: () => Date.parse("2026-10-16T18:00:00Z") });
  const r = await deps.bumpProCap("image", 30);
  assert.equal(r.allowed, false);
  const args = sb.log[0][2];
  assert.equal(args.p_bucket_key, "pro-image:u1");
  assert.equal(args.p_window_ms, 86_400_000);
  // 18:00Z 16/10 = 01:00 ngày 17/10 giờ VN → khung bắt đầu 17/10 (dịch +7h)
  assert.equal(args.p_window_start, "2026-10-17T00:00:00.000Z");
  assert.equal(vnDayShiftMs, 7 * 3_600_000);
});

test("bumpProCap có quota_key: chỉ tính trần khi key mới (lượt gọi 1, 41, 81…)", async () => {
  let keyCount = 0;
  const sb = fakeSb();
  sb.rpc = (name, args) => {
    sb.log.push(["rpc", name, args]);
    if (args.p_bucket_key.startsWith("pro-key")) return Promise.resolve({ data: ++keyCount, error: null });
    return Promise.resolve({ data: 1, error: null });
  };
  const deps = createBillingDeps({ supabase: sb, sharedSupabase: sb, userId: "u1", now: () => Date.parse("2026-10-16T05:00:00Z") });
  for (let i = 0; i < 41; i++) await deps.bumpProCap("sentence", 200, "k1");
  const capBumps = sb.log.filter((l) => l[2].p_bucket_key === "pro-sentence:u1").length;
  assert.equal(capBumps, 2, "lượt gọi 1 và 41");
  assert.equal(sb.log[0][2].p_bucket_key, "pro-key:u1:k1");
});
