import test from "node:test";
import assert from "node:assert/strict";
import { healthPayload } from "../../src/lib/health.js";

// /api/health: cổng kiểm của deploy blue/green — container mới phải báo đúng
// commit đang chạy thì nginx mới chuyển sang nó.
test("health trả commit đang chạy", () => {
  assert.deepEqual(healthPayload({ GIT_SHA: "a".repeat(40) }), { ok: true, sha: "a".repeat(40) });
});

test("thiếu GIT_SHA (build tay cũ) → sha 'unknown', vẫn ok", () => {
  assert.deepEqual(healthPayload({}), { ok: true, sha: "unknown" });
});
