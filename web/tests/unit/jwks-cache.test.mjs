// Test cho logic cache JWKS — phần quyết định KHI NÀO refresh, tách khỏi
// việc đọc/ghi Postgres thật (không test được bằng unit test).
//
// Xem tests/unit/jwt-verify.test.mjs cho phần verify chữ ký.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isJwksStale, JWKS_TTL_MS } from "../../src/lib/jwks-cache.js";

describe("isJwksStale", () => {
  test("mới cache → chưa cũ", () => {
    assert.equal(isJwksStale(Date.now(), Date.now()), false);
  });

  test("cache trong TTL → chưa cũ", () => {
    const cachedAt = Date.now() - (JWKS_TTL_MS - 1000);
    assert.equal(isJwksStale(cachedAt, Date.now()), false);
  });

  test("cache quá TTL → đã cũ, cần refresh", () => {
    const cachedAt = Date.now() - (JWKS_TTL_MS + 1000);
    assert.equal(isJwksStale(cachedAt, Date.now()), true);
  });

  test("không có cachedAt (chưa từng cache) → coi như đã cũ", () => {
    assert.equal(isJwksStale(null, Date.now()), true);
    assert.equal(isJwksStale(undefined, Date.now()), true);
  });
});
