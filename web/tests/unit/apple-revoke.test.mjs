import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportPKCS8, jwtVerify, decodeProtectedHeader } from "jose";
import {
  buildAppleClientSecret,
  revokeAppleAuthorization,
  readAppleConfig,
  decideAppleRevoke,
  isAppleUser,
  parseDeleteAccountBody,
} from "../../src/lib/auth/apple-revoke.js";

const NOW = 1_800_000_000;

// Khoá EC P-256 sinh riêng cho test — đóng vai file .p8 của Apple.
const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
const privateKeyPem = await exportPKCS8(privateKey);

const config = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  clientId: "com.example.wordly",
  privateKeyPem,
};

// fetch giả: trả lần lượt các response đã định, ghi lại mọi request.
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: new URLSearchParams(init.body) });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json ?? {},
    };
  };
  fn.calls = calls;
  return fn;
}

// ── buildAppleClientSecret ────────────────────────────────────────────────

test("client secret: header ES256 + kid, claim đúng chuẩn Apple, verify được bằng public key", async () => {
  const jwt = await buildAppleClientSecret({ ...config, now: NOW });
  const header = decodeProtectedHeader(jwt);
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, "KEY1234567");

  const { payload } = await jwtVerify(jwt, publicKey, {
    audience: "https://appleid.apple.com",
    issuer: "TEAM123456",
    currentDate: new Date(NOW * 1000),
  });
  assert.equal(payload.sub, "com.example.wordly");
  assert.equal(payload.iat, NOW);
  assert.ok(payload.exp > NOW && payload.exp <= NOW + 15 * 60, "exp phải ngắn hạn (≤ 15 phút)");
});

// ── revokeAppleAuthorization ───────────────────────────────────────────────

test("revoke: đổi code lấy refresh_token rồi thu hồi refresh_token", async () => {
  const fetch = fakeFetch([
    { status: 200, json: { refresh_token: "r-tok", access_token: "a-tok" } },
    { status: 200 },
  ]);
  const result = await revokeAppleAuthorization({ code: "the-code", config, fetch, now: () => NOW });
  assert.deepEqual(result, { ok: true });
  assert.equal(fetch.calls.length, 2);

  const [tokenCall, revokeCall] = fetch.calls;
  assert.equal(tokenCall.url, "https://appleid.apple.com/auth/token");
  assert.equal(tokenCall.init.method, "POST");
  assert.equal(tokenCall.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(tokenCall.body.get("client_id"), "com.example.wordly");
  assert.equal(tokenCall.body.get("code"), "the-code");
  assert.equal(tokenCall.body.get("grant_type"), "authorization_code");
  const secret = tokenCall.body.get("client_secret");
  await jwtVerify(secret, publicKey, { currentDate: new Date(NOW * 1000) });

  assert.equal(revokeCall.url, "https://appleid.apple.com/auth/revoke");
  assert.equal(revokeCall.init.method, "POST");
  assert.equal(revokeCall.body.get("client_id"), "com.example.wordly");
  assert.equal(revokeCall.body.get("client_secret"), secret);
  assert.equal(revokeCall.body.get("token"), "r-tok");
  assert.equal(revokeCall.body.get("token_type_hint"), "refresh_token");
});

test("revoke: không có refresh_token thì thu hồi access_token", async () => {
  const fetch = fakeFetch([{ status: 200, json: { access_token: "a-tok" } }, { status: 200 }]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.deepEqual(result, { ok: true });
  assert.equal(fetch.calls[1].body.get("token"), "a-tok");
  assert.equal(fetch.calls[1].body.get("token_type_hint"), "access_token");
});

test("revoke: thiếu config → step=config, không gọi mạng", async () => {
  const fetch = fakeFetch([]);
  const result = await revokeAppleAuthorization({ code: "c", config: null, fetch, now: () => NOW });
  assert.equal(result.ok, false);
  assert.equal(result.step, "config");
  assert.equal(fetch.calls.length, 0);
});

test("revoke: private key hỏng → step=config, không throw", async () => {
  const fetch = fakeFetch([]);
  const result = await revokeAppleAuthorization({
    code: "c",
    config: { ...config, privateKeyPem: "not a key" },
    fetch,
    now: () => NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.step, "config");
  assert.equal(fetch.calls.length, 0);
});

test("revoke: /auth/token trả lỗi → step=token kèm status + mã lỗi Apple", async () => {
  const fetch = fakeFetch([{ status: 400, json: { error: "invalid_grant" } }]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.deepEqual(result, { ok: false, step: "token", status: 400, error: "invalid_grant" });
  assert.equal(fetch.calls.length, 1);
});

test("revoke: /auth/token không trả token nào → step=token", async () => {
  const fetch = fakeFetch([{ status: 200, json: {} }]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.equal(result.ok, false);
  assert.equal(result.step, "token");
  assert.equal(fetch.calls.length, 1);
});

test("revoke: lỗi mạng ở /auth/token → step=token, không throw", async () => {
  const fetch = fakeFetch([new Error("ECONNRESET")]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.equal(result.ok, false);
  assert.equal(result.step, "token");
  assert.equal(result.status, null);
});

test("revoke: /auth/revoke trả lỗi → step=revoke", async () => {
  const fetch = fakeFetch([
    { status: 200, json: { refresh_token: "r" } },
    { status: 400, json: { error: "invalid_client" } },
  ]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.deepEqual(result, { ok: false, step: "revoke", status: 400, error: "invalid_client" });
});

test("revoke: lỗi mạng ở /auth/revoke → step=revoke, không throw", async () => {
  const fetch = fakeFetch([{ status: 200, json: { refresh_token: "r" } }, new Error("timeout")]);
  const result = await revokeAppleAuthorization({ code: "c", config, fetch, now: () => NOW });
  assert.equal(result.ok, false);
  assert.equal(result.step, "revoke");
});

test("revoke: kết quả lỗi không chứa code, token hay secret", async () => {
  const fetch = fakeFetch([
    { status: 200, json: { refresh_token: "SECRET-REFRESH" } },
    { status: 500, json: { error: "server_error" } },
  ]);
  const result = await revokeAppleAuthorization({ code: "SECRET-CODE", config, fetch, now: () => NOW });
  const text = JSON.stringify(result);
  assert.ok(!text.includes("SECRET-REFRESH"));
  assert.ok(!text.includes("SECRET-CODE"));
  assert.ok(!text.includes("BEGIN PRIVATE KEY"));
});

// ── readAppleConfig ────────────────────────────────────────────────────────

test("config: đọc đủ 4 biến, giải base64 private key", () => {
  const env = {
    APPLE_TEAM_ID: "T",
    APPLE_KEY_ID: "K",
    APPLE_CLIENT_ID: "com.example.wordly",
    APPLE_PRIVATE_KEY_BASE64: Buffer.from(privateKeyPem).toString("base64"),
  };
  assert.deepEqual(readAppleConfig(env), {
    teamId: "T",
    keyId: "K",
    clientId: "com.example.wordly",
    privateKeyPem,
  });
});

test("config: thiếu bất kỳ biến nào → null", () => {
  const full = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_CLIENT_ID: "C", APPLE_PRIVATE_KEY_BASE64: "eA==" };
  for (const key of Object.keys(full)) {
    const env = { ...full, [key]: "" };
    assert.equal(readAppleConfig(env), null, `thiếu ${key}`);
  }
  assert.equal(readAppleConfig({}), null);
});

// ── isAppleUser / parseDeleteAccountBody / decideAppleRevoke ──────────────

test("isAppleUser: nhận qua identities hoặc app_metadata.providers", () => {
  assert.equal(isAppleUser({ identities: [{ provider: "apple" }] }), true);
  assert.equal(isAppleUser({ identities: [{ provider: "email" }], app_metadata: { providers: ["email", "apple"] } }), true);
  assert.equal(isAppleUser({ app_metadata: { provider: "apple" } }), true);
  assert.equal(isAppleUser({ identities: [{ provider: "google" }], app_metadata: { providers: ["google"] } }), false);
  assert.equal(isAppleUser({}), false);
  assert.equal(isAppleUser(null), false);
});

test("parseDeleteAccountBody: body rỗng/hỏng/sai kiểu → không có code", () => {
  assert.equal(parseDeleteAccountBody(""), null);
  assert.equal(parseDeleteAccountBody(null), null);
  assert.equal(parseDeleteAccountBody("not json"), null);
  assert.equal(parseDeleteAccountBody("[]"), null);
  assert.equal(parseDeleteAccountBody('{"appleAuthorizationCode": 123}'), null);
  assert.equal(parseDeleteAccountBody('{"appleAuthorizationCode": "   "}'), null);
  assert.equal(parseDeleteAccountBody('{"appleAuthorizationCode": "abc"}'), "abc");
});

test("decideAppleRevoke: user Apple + có code → revoke", () => {
  const user = { identities: [{ provider: "apple" }] };
  assert.deepEqual(decideAppleRevoke({ user, code: "abc" }), { action: "revoke", code: "abc" });
});

test("decideAppleRevoke: user Apple không có code (bản app cũ) → warn, vẫn xoá", () => {
  const user = { identities: [{ provider: "apple" }] };
  assert.deepEqual(decideAppleRevoke({ user, code: null }), { action: "warn-missing-code" });
});

test("decideAppleRevoke: user không phải Apple → bỏ qua, kể cả khi có code", () => {
  const user = { identities: [{ provider: "email" }] };
  assert.deepEqual(decideAppleRevoke({ user, code: "abc" }), { action: "skip" });
  assert.deepEqual(decideAppleRevoke({ user, code: null }), { action: "skip" });
});
