// Chặn lượt dịch theo quảng cáo (spec 2026-10-23-in-app-ads-design.md): mọi
// lần dịch của người đã đăng nhập trên bản app có quảng cáo đều tính lượt;
// hết lượt miễn phí + hết lượt thưởng → 402 mời xem quảng cáo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTranslateQuota } from "../../src/lib/ads/enforce.js";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const KEY = "22222222-2222-2222-2222-222222222222";
const ON = { enforced: true, dailyFree: 10, rewardCredits: 10, minBuild: 23 };
const PRO = { source: "gift", expires_at: null };

function fakeDeps({ today = { used: 0, credits: 0, key_active: false }, entitlement = null, todayError } = {}) {
  const calls = [];
  return {
    calls,
    async getEntitlement() { calls.push("getEntitlement"); return entitlement; },
    async translateToday(k) {
      calls.push(["translateToday", k]);
      if (todayError) throw new Error("db down");
      return today;
    },
    async consumeTranslate(free, k) { calls.push(["consumeTranslate", free, k]); return { allowed: true }; },
  };
}

function runner(status = 200) {
  const r = async () => { r.count++; return Response.json({ translated: "x" }, { status }); };
  r.count = 0;
  return r;
}

const call = (opts, run) => withTranslateQuota({ config: ON, user: USER, build: "23", quotaKey: KEY, ...opts }, run);

test("tắt chặn → chạy y như cũ, không đọc DB", async () => {
  const deps = fakeDeps();
  const run = runner();
  const res = await call({ config: { ...ON, enforced: false }, deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
  assert.deepEqual(deps.calls, []);
});

test("khách → chạy, không đếm", async () => {
  const deps = fakeDeps();
  const run = runner();
  await call({ user: null, deps }, run);
  assert.equal(run.count, 1);
  assert.deepEqual(deps.calls, []);
});

test("app cũ (build < ADS_MIN_BUILD hoặc thiếu header) → chạy, không đếm", async () => {
  for (const build of ["22", undefined]) {
    const deps = fakeDeps();
    const run = runner();
    await call({ build, deps }, run);
    assert.equal(run.count, 1);
    assert.deepEqual(deps.calls, []);
  }
});

test("Pro / được tặng → không giới hạn, không đọc lượt", async () => {
  const deps = fakeDeps({ entitlement: PRO });
  const run = runner();
  await call({ deps }, run);
  assert.equal(run.count, 1);
  assert.deepEqual(deps.calls, ["getEntitlement"]);
});

test("hết lượt miễn phí + hết thưởng → 402 mời xem quảng cáo, không gọi AI", async () => {
  const deps = fakeDeps({ today: { used: 10, credits: 0, key_active: false } });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), {
    error: "Bạn đã dùng hết lượt dịch hôm nay. Xem một quảng cáo ngắn để nhận thêm 10 lượt.",
    code: "limit_translate", limit: 10, ad_available: true,
  });
  assert.equal(run.count, 0);
});

test("hết lượt miễn phí nhưng còn thưởng → dịch rồi trừ lượt", async () => {
  const deps = fakeDeps({ today: { used: 10, credits: 3, key_active: false } });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
  assert.deepEqual(deps.calls.at(-1), ["consumeTranslate", 10, KEY]);
});

test("câu đang soạn đã trừ lượt → không chặn giữa chừng", async () => {
  const deps = fakeDeps({ today: { used: 10, credits: 0, key_active: true } });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
});

test("dịch lỗi → không trừ lượt", async () => {
  const deps = fakeDeps();
  const res = await call({ deps }, runner(502));
  assert.equal(res.status, 502);
  assert.ok(!deps.calls.some((c) => c[0] === "consumeTranslate"));
});

test("đọc lượt lỗi → cho qua, không chặn", async () => {
  const deps = fakeDeps({ todayError: true });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
});

test("app huỷ request → không trừ lượt", async () => {
  const deps = fakeDeps();
  const ctl = new AbortController();
  ctl.abort();
  await call({ deps, signal: ctl.signal }, runner());
  assert.ok(!deps.calls.some((c) => c[0] === "consumeTranslate"));
});

test("quota_key không phải UUID → bỏ qua (tính theo request)", async () => {
  const deps = fakeDeps();
  await call({ deps, quotaKey: "abc" }, runner());
  assert.deepEqual(deps.calls.at(-1), ["consumeTranslate", 10, undefined]);
});
