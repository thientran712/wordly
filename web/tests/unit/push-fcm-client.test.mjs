import test from "node:test";
import assert from "node:assert/strict";
import { sendFcmMessage, isDeadToken, isFatal } from "../../src/lib/push/fcm-client.js";

const fcmError = (status, httpStatus, errorCode, message = "") => ({
  ok: false, status: httpStatus,
  json: async () => ({ error: { code: httpStatus, status, message,
    details: errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : [] } }),
});

test("gửi đúng URL, Bearer, body { message }", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ name: "x" }) }; };
  const r = await sendFcmMessage({ projectId: "p1", accessToken: "AT", message: { token: "T" }, fetchImpl });
  assert.deepEqual(r, { ok: true, status: 200, code: null, message: "" });
  assert.equal(seen.url, "https://fcm.googleapis.com/v1/projects/p1/messages:send");
  assert.equal(seen.init.headers.Authorization, "Bearer AT");
  assert.deepEqual(JSON.parse(seen.init.body), { message: { token: "T" } });
});

test("lấy errorCode trong details, rơi về error.status", async () => {
  const r1 = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => fcmError("NOT_FOUND", 404, "UNREGISTERED") });
  assert.equal(r1.code, "UNREGISTERED");
  const r2 = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => fcmError("UNAUTHENTICATED", 401, null) });
  assert.equal(r2.code, "UNAUTHENTICATED");
  assert.equal(r2.status, 401);
});

test("lỗi mạng → code NETWORK, không throw", async () => {
  const r = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(r.code, "NETWORK");
  assert.equal(r.ok, false);
});

test("token chết: UNREGISTERED, SENDER_ID_MISMATCH, INVALID_ARGUMENT nói về registration token", () => {
  assert.equal(isDeadToken({ code: "UNREGISTERED" }), true);
  assert.equal(isDeadToken({ code: "SENDER_ID_MISMATCH", status: 403 }), true);
  assert.equal(isDeadToken({ code: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" }), true);
});

test("INVALID_ARGUMENT do payload sai KHÔNG phải token chết (Review Focus #2)", () => {
  assert.equal(isDeadToken({ code: "INVALID_ARGUMENT", message: "Invalid value at 'message.apns.headers'" }), false);
  assert.equal(isDeadToken({ code: "QUOTA_EXCEEDED" }), false);
  assert.equal(isDeadToken({ code: "UNAVAILABLE" }), false);
});

test("lỗi nặng dừng cả lượt: THIRD_PARTY_AUTH_ERROR, 401, 403 không phải SENDER_ID_MISMATCH", () => {
  assert.equal(isFatal({ code: "THIRD_PARTY_AUTH_ERROR", status: 401 }), true);
  assert.equal(isFatal({ code: "UNAUTHENTICATED", status: 401 }), true);
  assert.equal(isFatal({ code: "PERMISSION_DENIED", status: 403 }), true);
  assert.equal(isFatal({ code: "SENDER_ID_MISMATCH", status: 403 }), false);
  assert.equal(isFatal({ code: "UNAVAILABLE", status: 503 }), false);
  assert.equal(isFatal({ code: "QUOTA_EXCEEDED", status: 429 }), false);
});
