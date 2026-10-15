import test from "node:test";
import assert from "node:assert/strict";
import {
  billingConfig, withAdvancedQuota, withDictionaryQuota, checkSaveAllowed, checkPushSlotAllowed,
} from "../../src/lib/billing/enforce.js";

const NOW = new Date("2026-10-16T05:00:00Z");
const ON = { enforced: true, minBuild: 21 };
const OFF = { enforced: false, minBuild: 21 };
const USER = { id: "u1" };
const PRO_ENT = { source: "app_store", expires_at: "2026-11-16T00:00:00Z" };
const EXPIRED_ENT = { source: "app_store", expires_at: "2026-10-01T00:00:00Z" };

// Deps giả ghi lại mọi lời gọi — để khẳng định "Pro thì không gọi hàm hạn mức".
function fakeDeps({ entitlement = null, usage = {}, consumeResult = { allowed: true }, capAllowed = true, saved = 0, enabledSlots = 0, fail = {} } = {}) {
  const calls = [];
  const rec = (name, ...args) => { calls.push([name, ...args]); if (fail[name]) throw new Error(`${name} hỏng`); };
  return {
    calls,
    names: () => calls.map((c) => c[0]),
    getEntitlement: async () => { rec("getEntitlement"); return entitlement; },
    usageToday: async (key, qk) => { rec("usageToday", key, qk); return { advanced_translate: 0, dictionary: 0, known_word: false, ...usage }; },
    consume: async (kind, limit, key, qk) => { rec("consume", kind, limit, key, qk); return consumeResult; },
    bumpProCap: async (kind, cap, qk) => { rec("bumpProCap", kind, cap, qk); return { allowed: capAllowed }; },
    countSaved: async () => { rec("countSaved"); return saved; },
    countEnabledSlots: async () => { rec("countEnabledSlots"); return enabledSlots; },
  };
}
const ok = (body = { translated: "x" }) => async () => Response.json(body);
const fail502 = async () => Response.json({ error: "AI lỗi" }, { status: 502 });
const runSpy = (fn = ok()) => { const f = async (...a) => { f.n++; f.args = a; return fn(...a); }; f.n = 0; return f; };

test("billingConfig đọc env", () => {
  assert.deepEqual(billingConfig({}), { enforced: false, minBuild: 0 });
  assert.deepEqual(billingConfig({ BILLING_ENFORCE: "1", APP_MIN_BUILD: "21" }), { enforced: true, minBuild: 21 });
});

// ── Dịch nâng cao ────────────────────────────────────────────────────────────
test("advanced: tắt chặn → chạy y như cũ, không đụng DB billing", async () => {
  const deps = fakeDeps();
  const run = runSpy();
  const res = await withAdvancedQuota({ config: OFF, user: null, build: null, kind: "sentence", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
  assert.deepEqual(deps.calls, []);
});

test("advanced: build cũ / thiếu header → 426, không gọi AI", async () => {
  for (const build of [null, "20"]) {
    const deps = fakeDeps();
    const run = runSpy();
    const res = await withAdvancedQuota({ config: ON, user: USER, build, kind: "image", deps, now: NOW }, run);
    assert.equal(res.status, 426);
    assert.deepEqual(await res.json(), { error: "Phiên bản Wordly này đã cũ, hãy cập nhật trên App Store để tiếp tục.", code: "update_required" });
    assert.equal(run.n, 0);
  }
});

test("advanced: khách khi đang chặn → 401, không gọi AI", async () => {
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: null, build: "21", kind: "sentence", deps: fakeDeps(), now: NOW }, run);
  assert.equal(res.status, 401);
  assert.equal(run.n, 0);
});

test("advanced miễn phí: còn lượt → gọi AI rồi mới trừ 1 lượt", async () => {
  const deps = fakeDeps({ usage: { advanced_translate: 4 } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "voice", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
  assert.deepEqual(deps.calls.find((c) => c[0] === "consume"), ["consume", "advanced_translate", 5, undefined, undefined]);
  assert.ok(deps.names().indexOf("usageToday") < deps.names().indexOf("consume"));
});

test("advanced miễn phí: hết lượt TRƯỚC khi gọi → 402, không gọi AI, không trừ", async () => {
  const deps = fakeDeps({ usage: { advanced_translate: 5 } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW }, run);
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.equal(body.code, "limit_advanced_translate");
  assert.equal(body.limit, 5);
  assert.equal(run.n, 0);
  assert.ok(!deps.names().includes("consume"));
});

test("advanced miễn phí: AI lỗi (5xx/4xx) → không trừ lượt", async () => {
  for (const status of [502, 422, 504]) {
    const deps = fakeDeps();
    const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "image", deps, now: NOW },
      async () => Response.json({ error: "x" }, { status }));
    assert.equal(res.status, status);
    assert.ok(!deps.names().includes("consume"), `status ${status}`);
  }
});

test("advanced miễn phí: AI throw → không trừ lượt, lỗi đi tiếp", async () => {
  const deps = fakeDeps();
  await assert.rejects(withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "image", deps, now: NOW },
    async () => { throw new Error("timeout"); }));
  assert.ok(!deps.names().includes("consume"));
});

test("advanced Pro: không gọi hàm hạn mức nào (usageToday/consume), chỉ trần chống lạm dụng", async () => {
  const deps = fakeDeps({ entitlement: PRO_ENT, usage: { advanced_translate: 99 } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "image", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
  assert.deepEqual(deps.names(), ["getEntitlement", "bumpProCap"]);
  assert.deepEqual(deps.calls[1], ["bumpProCap", "image", 30, undefined]);
});

test("advanced Pro: chạm trần chống lạm dụng → 402 với trần của loại đó", async () => {
  const deps = fakeDeps({ entitlement: PRO_ENT, capAllowed: false });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW }, run);
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.equal(body.code, "limit_advanced_translate");
  assert.equal(body.limit, 200);
  assert.equal(run.n, 0);
});

test("advanced: Pro đã hết hạn → về miễn phí", async () => {
  const deps = fakeDeps({ entitlement: EXPIRED_ENT, usage: { advanced_translate: 5 } });
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW }, runSpy());
  assert.equal(res.status, 402);
});

test("advanced: DB billing lỗi → cho qua (không chặn người dùng thật vì sự cố)", async () => {
  const deps = fakeDeps({ fail: { usageToday: true } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
});

test("advanced: trừ lượt lỗi sau khi AI xong → vẫn trả kết quả", async () => {
  const deps = fakeDeps({ fail: { consume: true } });
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW }, runSpy());
  assert.equal(res.status, 200);
});

// ── Tra từ ───────────────────────────────────────────────────────────────────
const dictOk = (detail = { word: "x" }) => runSpy(async () => Response.json({ detail }));

test("dictionary: tắt chặn → như cũ", async () => {
  const deps = fakeDeps();
  const run = dictOk();
  const res = await withDictionaryQuota({ config: OFF, user: USER, build: null, wordKey: "x", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.deepEqual(deps.calls, []);
  assert.deepEqual(run.args, [{ cacheOnly: false }]);
});

test("dictionary: từ đã biết → miễn phí, không trừ, không cần header mới (widget app cũ vẫn chạy)", async () => {
  const deps = fakeDeps({ usage: { known_word: true, dictionary: 5 } });
  const run = dictOk();
  const res = await withDictionaryQuota({ config: ON, user: USER, build: null, wordKey: "resilient", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
  assert.ok(!deps.names().includes("consume"));
});

test("dictionary: từ mới + build cũ → 426", async () => {
  const run = dictOk();
  const res = await withDictionaryQuota({ config: ON, user: USER, build: null, wordKey: "new", deps: fakeDeps(), now: NOW }, run);
  assert.equal(res.status, 426);
  assert.equal(run.n, 0);
});

test("dictionary: từ mới còn lượt → tra rồi trừ (ghi từ vào dictionary_lookups)", async () => {
  const deps = fakeDeps({ usage: { dictionary: 2 } });
  const res = await withDictionaryQuota({ config: ON, user: USER, build: "21", wordKey: "new", deps, now: NOW }, dictOk());
  assert.equal(res.status, 200);
  assert.deepEqual(deps.calls.find((c) => c[0] === "consume"), ["consume", "dictionary", 5, "new", undefined]);
});

test("dictionary: từ mới hết lượt → 402 limit_dictionary, không gọi AI", async () => {
  const run = dictOk();
  const res = await withDictionaryQuota({ config: ON, user: USER, build: "21", wordKey: "new", deps: fakeDeps({ usage: { dictionary: 5 } }), now: NOW }, run);
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json().then((b) => [b.code, b.limit]), ["limit_dictionary", 5]);
  assert.equal(run.n, 0);
});

test("dictionary: không ra nghĩa (detail null) hoặc lỗi → không trừ", async () => {
  for (const run of [dictOk(null), runSpy(fail502)]) {
    const deps = fakeDeps();
    await withDictionaryQuota({ config: ON, user: USER, build: "21", wordKey: "zzz", deps, now: NOW }, run);
    assert.ok(!deps.names().includes("consume"));
  }
});

test("dictionary: Pro → không gọi hàm hạn mức", async () => {
  const deps = fakeDeps({ entitlement: PRO_ENT });
  const res = await withDictionaryQuota({ config: ON, user: USER, build: "21", wordKey: "new", deps, now: NOW }, dictOk());
  assert.equal(res.status, 200);
  assert.deepEqual(deps.names(), ["getEntitlement"]);
});

test("dictionary: purpose=widget từ mới → chỉ cache, không tính, không 426", async () => {
  const deps = fakeDeps({ usage: { dictionary: 5 } });
  const run = dictOk();
  const res = await withDictionaryQuota({ config: ON, user: USER, build: null, wordKey: "new", purpose: "widget", deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.deepEqual(run.args, [{ cacheOnly: true }]);
  assert.ok(!deps.names().includes("consume"));
});

test("dictionary: khách khi đang chặn → chỉ cache", async () => {
  const deps = fakeDeps();
  const run = dictOk();
  await withDictionaryQuota({ config: ON, user: null, build: "21", wordKey: "new", deps, now: NOW }, run);
  assert.deepEqual(run.args, [{ cacheOnly: true }]);
  assert.deepEqual(deps.calls, []);
});

// ── Lưu từ ───────────────────────────────────────────────────────────────────
test("save: tắt chặn → không chặn, không đếm", async () => {
  const deps = fakeDeps({ saved: 100 });
  assert.equal(await checkSaveAllowed({ config: OFF, user: USER, build: null, deps, now: NOW }), null);
  assert.deepEqual(deps.calls, []);
});

test("save: build cũ → 426", async () => {
  const res = await checkSaveAllowed({ config: ON, user: USER, build: null, deps: fakeDeps(), now: NOW });
  assert.equal(res.status, 426);
});

test("save miễn phí: 29 → cho lưu; 30 / 45 → 402 limit_saved_words", async () => {
  assert.equal(await checkSaveAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ saved: 29 }), now: NOW }), null);
  for (const saved of [30, 45]) {
    const res = await checkSaveAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ saved }), now: NOW });
    assert.equal(res.status, 402);
    assert.deepEqual(await res.json().then((b) => [b.code, b.limit]), ["limit_saved_words", 30]);
  }
});

test("save Pro: không đếm, cho lưu", async () => {
  const deps = fakeDeps({ entitlement: PRO_ENT, saved: 500 });
  assert.equal(await checkSaveAllowed({ config: ON, user: USER, build: "21", deps, now: NOW }), null);
  assert.deepEqual(deps.names(), ["getEntitlement"]);
});

// ── Khung giờ nhắc ───────────────────────────────────────────────────────────
test("push slot: miễn phí đã có 1 khung bật → 402 limit_push_slots; 0 → cho", async () => {
  const res = await checkPushSlotAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ enabledSlots: 1 }), now: NOW });
  assert.equal(res.status, 402);
  assert.deepEqual(await res.json().then((b) => [b.code, b.limit]), ["limit_push_slots", 1]);
  assert.equal(await checkPushSlotAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ enabledSlots: 0 }), now: NOW }), null);
});

test("push slot: Pro tới 10; tắt chặn → không đụng gì; build cũ → 426", async () => {
  assert.equal(await checkPushSlotAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ entitlement: PRO_ENT, enabledSlots: 5 }), now: NOW }), null);
  const full = await checkPushSlotAllowed({ config: ON, user: USER, build: "21", deps: fakeDeps({ entitlement: PRO_ENT, enabledSlots: 10 }), now: NOW });
  assert.equal(full.status, 402);
  const off = fakeDeps({ enabledSlots: 5 });
  assert.equal(await checkPushSlotAllowed({ config: OFF, user: USER, build: null, deps: off, now: NOW }), null);
  assert.deepEqual(off.calls, []);
  assert.equal((await checkPushSlotAllowed({ config: ON, user: USER, build: "3", deps: fakeDeps(), now: NOW })).status, 426);
});

test("app huỷ request (signal aborted) trước khi xong → không trừ lượt", async () => {
  const ac = new AbortController();
  const deps = fakeDeps();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", deps, now: NOW, signal: ac.signal },
    async () => { ac.abort(); return Response.json({ translated: "x" }); });
  assert.equal(res.status, 200);
  assert.ok(!deps.names().includes("consume"));
  const d2 = fakeDeps();
  const ac2 = new AbortController();
  await withDictionaryQuota({ config: ON, user: USER, build: "21", wordKey: "new", deps: d2, now: NOW, signal: ac2.signal },
    async () => { ac2.abort(); return Response.json({ detail: { word: "new" } }); });
  assert.ok(!d2.names().includes("consume"));
});

// ── quota_key: một câu đang soạn (dịch trực tiếp khi gõ/nói) = một lượt ──────
const KEY = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

test("quota_key: chuyển xuống usageToday + consume (câu / giọng nói)", async () => {
  for (const kind of ["sentence", "voice"]) {
    const deps = fakeDeps();
    await withAdvancedQuota({ config: ON, user: USER, build: "21", kind, quotaKey: KEY, deps, now: NOW }, runSpy());
    assert.deepEqual(deps.calls.find((c) => c[0] === "usageToday"), ["usageToday", undefined, KEY]);
    assert.deepEqual(deps.calls.find((c) => c[0] === "consume"), ["consume", "advanced_translate", 5, undefined, KEY]);
  }
});

test("quota_key: ảnh luôn tính theo request (bỏ key)", async () => {
  const deps = fakeDeps();
  await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "image", quotaKey: KEY, deps, now: NOW }, runSpy());
  assert.deepEqual(deps.calls.find((c) => c[0] === "consume"), ["consume", "advanced_translate", 5, undefined, undefined]);
});

test("quota_key sai định dạng → coi như không có key (tính theo request)", async () => {
  const deps = fakeDeps();
  await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", quotaKey: "not-a-uuid", deps, now: NOW }, runSpy());
  assert.deepEqual(deps.calls.find((c) => c[0] === "consume"), ["consume", "advanced_translate", 5, undefined, undefined]);
});

test("quota_key: đã hết lượt nhưng key đã trừ hôm nay → vẫn dịch (không 402 giữa câu)", async () => {
  const deps = fakeDeps({ usage: { advanced_translate: 5, key_active: true } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", quotaKey: KEY, deps, now: NOW }, run);
  assert.equal(res.status, 200);
  assert.equal(run.n, 1);
});

test("quota_key: đã hết lượt + key mới → 402, không gọi AI", async () => {
  const deps = fakeDeps({ usage: { advanced_translate: 5, key_active: false } });
  const run = runSpy();
  const res = await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", quotaKey: KEY, deps, now: NOW }, run);
  assert.equal(res.status, 402);
  assert.equal(run.n, 0);
});

test("quota_key Pro: trần chống lạm dụng cũng gộp theo key (không gọi hàm hạn mức)", async () => {
  const deps = fakeDeps({ entitlement: PRO_ENT });
  await withAdvancedQuota({ config: ON, user: USER, build: "21", kind: "sentence", quotaKey: KEY, deps, now: NOW }, runSpy());
  assert.deepEqual(deps.calls, [["getEntitlement"], ["bumpProCap", "sentence", 200, KEY]]);
});

test("billingConfig: tài khoản test được bật chặn theo userId", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  assert.equal(billingConfig({ BILLING_ENFORCE_TEST_USERS: A }, A).enforced, true);
  assert.equal(billingConfig({ BILLING_ENFORCE_TEST_USERS: A }).enforced, false);
});
