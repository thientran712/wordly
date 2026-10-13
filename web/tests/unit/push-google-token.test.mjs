import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { createGoogleTokenProvider } from "../../src/lib/push/google-access-token.js";
import { loadFcmConfig } from "../../src/lib/push/fcm-config.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const sa = { client_email: "push@wordly.iam.gserviceaccount.com", private_key: privateKey, project_id: "wordly-123" };

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

test("ký JWT RS256 đúng iss/aud/scope rồi đổi lấy access token", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { access_token: "AT1", expires_in: 3600 } }]);
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl });
  assert.equal(await p.get(), "AT1");
  const { url, body } = fetchImpl.calls[0];
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const { payload, protectedHeader } = await jwtVerify(body.get("assertion"), await importSPKI(publicKey, "RS256"), {
    issuer: sa.client_email, audience: "https://oauth2.googleapis.com/token",
  });
  assert.equal(protectedHeader.alg, "RS256");
  assert.equal(payload.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assert.equal(payload.exp - payload.iat, 3600);
});

test("cache tới 5 phút trước hạn, sau đó xin mới; invalidate xin mới ngay", async () => {
  let now = Date.now();
  const fetchImpl = fakeFetch([
    { status: 200, body: { access_token: "AT1", expires_in: 3600 } },
    { status: 200, body: { access_token: "AT2", expires_in: 3600 } },
    { status: 200, body: { access_token: "AT3", expires_in: 3600 } },
  ]);
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl, clock: () => now });
  assert.equal(await p.get(), "AT1");
  now += 54 * 60 * 1000;
  assert.equal(await p.get(), "AT1");
  now += 2 * 60 * 1000; // còn < 5 phút
  assert.equal(await p.get(), "AT2");
  p.invalidate();
  assert.equal(await p.get(), "AT3");
  assert.equal(fetchImpl.calls.length, 3);
});

test("Google từ chối → throw có mã lỗi", async () => {
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl: fakeFetch([{ status: 400, body: { error: "invalid_grant" } }]) });
  await assert.rejects(() => p.get(), /400 invalid_grant/);
});

test("loadFcmConfig: thiếu biến → null; đủ → projectId (env ưu tiên hơn JSON); hỏng → throw", () => {
  assert.equal(loadFcmConfig({}), null);
  const b64 = Buffer.from(JSON.stringify(sa)).toString("base64");
  assert.equal(loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: b64 }).projectId, "wordly-123");
  assert.equal(loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: b64, FCM_PROJECT_ID: "khac" }).projectId, "khac");
  assert.throws(() => loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: "bm90LWpzb24=" }), /FCM_SERVICE_ACCOUNT_BASE64/);
  const missing = Buffer.from(JSON.stringify({ project_id: "p" })).toString("base64");
  assert.throws(() => loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: missing }), /client_email/);
});
