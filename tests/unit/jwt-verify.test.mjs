// Test cho verify JWT cục bộ bằng WebCrypto (không gọi mạng mỗi request).
//
// VÌ SAO CẦN: middleware gọi supabase.auth.getClaims() ở MỌI request. Hàm
// này verify JWT bằng JWKS, nhưng cache JWKS nằm trong RAM của GoTrueClient
// instance — trên Vercel serverless, mỗi cold start tạo instance MỚI nên
// cache mất tác dụng, và mỗi request phải gọi mạng tới
// /auth/v1/.well-known/jwks.json (~150-330ms đo được thực tế).
//
// Sửa: cache JWKS trong Postgres (dùng chung mọi serverless instance,
// giống pattern rate_limit_counters đã làm), tự verify JWT bằng WebCrypto.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { verifyJwtWithJwks, decodeJwtPayload, isJwtExpired } from "../../src/lib/jwt-verify.js";

describe("decodeJwtPayload", () => {
  test("giải mã đúng payload không cần verify chữ ký", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const jwt = await new SignJWT({ user_orgs: { "org-1": "owner" } })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
      .setExpirationTime("1h")
      .sign(privateKey);

    const payload = decodeJwtPayload(jwt);
    assert.deepEqual(payload.user_orgs, { "org-1": "owner" });
  });

  test("JWT lỗi định dạng trả về null, không sập", () => {
    assert.equal(decodeJwtPayload("khong-phai-jwt"), null);
    assert.equal(decodeJwtPayload(""), null);
    assert.equal(decodeJwtPayload(null), null);
  });
});

describe("isJwtExpired", () => {
  test("exp trong quá khứ → hết hạn", () => {
    assert.equal(isJwtExpired({ exp: Math.floor(Date.now() / 1000) - 60 }), true);
  });
  test("exp trong tương lai → chưa hết hạn", () => {
    assert.equal(isJwtExpired({ exp: Math.floor(Date.now() / 1000) + 3600 }), false);
  });
  test("thiếu exp → coi như hết hạn (fail-closed)", () => {
    assert.equal(isJwtExpired({}), true);
  });
});

describe("verifyJwtWithJwks — cổng bảo mật chính", () => {
  test("JWT ký đúng key trong JWKS → hợp lệ", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-kid-1";
    jwk.alg = "ES256";

    const jwt = await new SignJWT({ sub: "user-1", user_orgs: {} })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid-1" })
      .setExpirationTime("1h")
      .sign(privateKey);

    const result = await verifyJwtWithJwks(jwt, { keys: [jwk] });
    assert.equal(result.valid, true);
    assert.equal(result.payload.sub, "user-1");
  });

  test("JWT ký bằng key KHÁC (giả mạo) → bị từ chối", async () => {
    const { privateKey: attackerKey } = await generateKeyPair("ES256");
    const { publicKey: realPublicKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(realPublicKey);
    jwk.kid = "test-kid-2";
    jwk.alg = "ES256";

    // Kẻ tấn công ký bằng key riêng nhưng khai kid trùng key thật
    const forgedJwt = await new SignJWT({ sub: "attacker", user_orgs: { "org-1": "owner" } })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid-2" })
      .setExpirationTime("1h")
      .sign(attackerKey);

    const result = await verifyJwtWithJwks(forgedJwt, { keys: [jwk] });
    assert.equal(result.valid, false, "RÒ RỈ: JWT giả mạo được chấp nhận");
  });

  test("kid không tồn tại trong JWKS → từ chối, không sập", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const jwt = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "kid-khong-ton-tai" })
      .setExpirationTime("1h")
      .sign(privateKey);

    const result = await verifyJwtWithJwks(jwt, { keys: [] });
    assert.equal(result.valid, false);
  });

  test("JWT hết hạn → từ chối dù chữ ký đúng", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-kid-3";
    jwk.alg = "ES256";

    const expiredJwt = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "test-kid-3" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(privateKey);

    const result = await verifyJwtWithJwks(expiredJwt, { keys: [jwk] });
    assert.equal(result.valid, false);
  });

  test("input rác không làm sập hàm", async () => {
    const r1 = await verifyJwtWithJwks("not-a-jwt", { keys: [] });
    assert.equal(r1.valid, false);
    const r2 = await verifyJwtWithJwks(null, { keys: [] });
    assert.equal(r2.valid, false);
    const r3 = await verifyJwtWithJwks("a.b.c", { keys: [] });
    assert.equal(r3.valid, false);
  });
});
