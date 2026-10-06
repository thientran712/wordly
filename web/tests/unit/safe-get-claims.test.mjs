// Test cho getClaimsSafely — bọc supabase.auth.getClaims() để KHÔNG BAO GIỜ throw.
//
// VÌ SAO CẦN: getClaims() ném exception (không trả { error }) khi JWT thiếu
// claim `exp` — ví dụ "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln". Middleware
// không bắt → MIDDLEWARE_INVOCATION_FAILED, trả 500 cho mọi request mang token
// đó. Đo trên Vercel Preview 6/10/2026: header Bearer như trên → 500.
// Ai cũng gửi được header này, nên phải coi là "chưa đăng nhập" (401).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { getClaimsSafely } from "../../src/lib/auth/safe-get-claims.js";

const sdk = () =>
  createClient("https://example.supabase.co", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
  });

describe("getClaimsSafely", () => {
  test("JWT thiếu exp (SDK thật throw) → trả error, không throw", async () => {
    const result = await getClaimsSafely(sdk().auth, "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln", { keys: [] });
    assert.equal(result.data, null);
    assert.ok(result.error, "phải có error");
  });

  test("header JWT rác → trả error, không throw", async () => {
    const result = await getClaimsSafely(sdk().auth, "e30.e30.c2ln", { keys: [] });
    assert.equal(result.data, null);
    assert.ok(result.error);
  });

  test("kết quả bình thường của SDK được trả nguyên", async () => {
    const ok = { data: { claims: { sub: "u1" } }, error: null };
    const auth = { getClaims: async () => ok };
    assert.equal(await getClaimsSafely(auth, "x.y.z"), ok);
  });

  test("truyền đúng jwt + options xuống SDK", async () => {
    let seen;
    const auth = { getClaims: async (jwt, opts) => { seen = [jwt, opts]; return { data: null, error: null }; } };
    await getClaimsSafely(auth, undefined, { keys: ["k"] });
    assert.deepEqual(seen, [undefined, { keys: ["k"] }]);
  });
});
