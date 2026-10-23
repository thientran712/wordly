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

// `consume`: kết quả consume_translate (mặc định còn lượt, trừ lượt miễn phí)
function fakeDeps({ consume = { allowed: true, charged: "free", charge_id: "c1" }, entitlement = null, consumeError } = {}) {
  const calls = [];
  return {
    calls,
    async getEntitlement() { calls.push("getEntitlement"); return entitlement; },
    async consumeTranslate(free, k) {
      calls.push(["consumeTranslate", free, k]);
      if (consumeError) throw new Error("db down");
      return typeof consume === "function" ? consume() : consume;
    },
    async refundTranslate(id) { calls.push(["refundTranslate", id]); },
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

test("hết lượt (consume không cho) → 402 mời xem quảng cáo, không gọi AI", async () => {
  const deps = fakeDeps({ consume: { allowed: false, charged: "none" } });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json(), {
    error: "Bạn đã dùng hết lượt dịch hôm nay. Xem một quảng cáo ngắn để nhận thêm 10 lượt.",
    code: "limit_translate", limit: 10, ad_available: true,
  });
  assert.equal(run.count, 0);
});

test("giữ lượt TRƯỚC khi gọi AI, dịch xong không trừ thêm", async () => {
  const deps = fakeDeps();
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
  assert.deepEqual(deps.calls, ["getEntitlement", ["consumeTranslate", 10, KEY]]);
});

test("song song khi còn đúng 1 lượt → chỉ một request được dịch", async () => {
  let left = 1;
  const deps = fakeDeps({ consume: () => (left-- > 0 ? { allowed: true, charged: "credit", charge_id: "c1" } : { allowed: false, charged: "none" }) });
  const run = runner();
  const rs = await Promise.all([call({ deps }, run), call({ deps }, run), call({ deps }, run)]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 402, 402]);
  assert.equal(run.count, 1);
});

test("dịch lỗi → hoàn lại lượt đã giữ", async () => {
  const deps = fakeDeps();
  const res = await call({ deps }, runner(502));
  assert.equal(res.status, 502);
  assert.deepEqual(deps.calls.at(-1), ["refundTranslate", "c1"]);
});

test("câu đang soạn (không trừ lượt) dịch lỗi → không có gì để hoàn", async () => {
  const deps = fakeDeps({ consume: { allowed: true, charged: "none" } });
  await call({ deps }, runner(502));
  assert.ok(!deps.calls.some((c) => c[0] === "refundTranslate"));
});

test("trừ lượt lỗi DB → cho qua, không chặn", async () => {
  const deps = fakeDeps({ consumeError: true });
  const run = runner();
  const res = await call({ deps }, run);
  assert.equal(res.status, 200);
  assert.equal(run.count, 1);
});

test("app huỷ request → hoàn lại lượt", async () => {
  const deps = fakeDeps();
  const ctl = new AbortController();
  ctl.abort();
  await call({ deps, signal: ctl.signal }, runner());
  assert.deepEqual(deps.calls.at(-1), ["refundTranslate", "c1"]);
});

test("quota_key không phải UUID → bỏ qua (tính theo request)", async () => {
  const deps = fakeDeps();
  await call({ deps, quotaKey: "abc" }, runner());
  assert.deepEqual(deps.calls.at(-1), ["consumeTranslate", 10, undefined]);
});
