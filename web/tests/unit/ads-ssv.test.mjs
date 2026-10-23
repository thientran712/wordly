// Callback SSV của AdMob (spec 2026-10-23-in-app-ads-design.md): Google gọi
// GET kèm chữ ký ECDSA P-256 trên phần query trước `&signature=`. Chỉ thưởng
// khi chữ ký đúng và dữ liệu hợp lệ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifySsvSignature, parseReward, handleRewardCallback, fetchVerifierKeys } from "../../src/lib/ads/ssv.js";

const UID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const KEYS = [{ keyId: 1, pem: publicKey.export({ type: "spki", format: "pem" }) }];

function signedQuery(content, keyId = 1) {
  const sig = sign("sha256", Buffer.from(content), privateKey).toString("base64url");
  return `${content}&signature=${sig}&key_id=${keyId}`;
}

const CONTENT = `ad_network=5450213213286189855&ad_unit=1234567890&custom_data=translate&reward_amount=1&reward_item=Reward&timestamp=1761200000000&transaction_id=abc123&user_id=${UID}`;

test("verifySsvSignature: chữ ký đúng → true", () => {
  assert.equal(verifySsvSignature(signedQuery(CONTENT), KEYS), true);
});

test("verifySsvSignature: sửa nội dung → false", () => {
  const q = signedQuery(CONTENT).replace(UID, UID.replace("3f2a", "3f2b"));
  assert.equal(verifySsvSignature(q, KEYS), false);
});

test("verifySsvSignature: key_id lạ / thiếu chữ ký / chữ ký rác → false", () => {
  assert.equal(verifySsvSignature(signedQuery(CONTENT, 99), KEYS), false);
  assert.equal(verifySsvSignature(CONTENT, KEYS), false);
  assert.equal(verifySsvSignature(`${CONTENT}&signature=%%%&key_id=1`, KEYS), false);
  assert.equal(verifySsvSignature("", KEYS), false);
});

test("parseReward: lượt dịch", () => {
  assert.deepEqual(parseReward(new URLSearchParams(CONTENT)), {
    transactionId: "abc123", userId: UID, kind: "translate", themeId: null,
  });
});

test("parseReward: theme", () => {
  const p = new URLSearchParams(CONTENT.replace("custom_data=translate", "custom_data=theme%3Anature_1"));
  assert.deepEqual(parseReward(p), { transactionId: "abc123", userId: UID, kind: "theme", themeId: "nature_1" });
});

test("parseReward: dữ liệu sai → null", () => {
  const bad = [
    CONTENT.replace("custom_data=translate", "custom_data=theme%3A..%2Fx"),
    CONTENT.replace("custom_data=translate", "custom_data=gold"),
    CONTENT.replace("custom_data=translate&", ""),
    CONTENT.replace(`user_id=${UID}`, "user_id=abc"),
    CONTENT.replace("transaction_id=abc123&", ""),
  ];
  for (const q of bad) assert.equal(parseReward(new URLSearchParams(q)), null, q);
});

function grantSpy(result = "applied") {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (result instanceof Error) throw result;
    return result;
  };
  fn.calls = calls;
  return fn;
}
const keysOk = async () => KEYS;

test("handleRewardCallback: hợp lệ → cấp thưởng đúng người, 200", async () => {
  const grant = grantSpy();
  const r = await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys: keysOk, grant, rewardCredits: 10 });
  assert.equal(r.status, 200);
  assert.deepEqual(grant.calls, [{
    p_transaction_id: "abc123", p_user_id: UID, p_kind: "translate", p_theme_id: null, p_credits: 10,
  }]);
});

test("handleRewardCallback: giao dịch đã cấp → vẫn 200 (Google không gọi lại)", async () => {
  const r = await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys: keysOk, grant: grantSpy("duplicate"), rewardCredits: 10 });
  assert.equal(r.status, 200);
});

test("handleRewardCallback: chữ ký sai → 400, không cấp", async () => {
  const grant = grantSpy();
  const forged = signedQuery(CONTENT).replace("custom_data=translate", "custom_data=theme%3Ax");
  assert.equal((await handleRewardCallback({ rawQuery: forged, getKeys: keysOk, grant, rewardCredits: 10 })).status, 400);
  assert.equal(grant.calls.length, 0);
});

// Chữ ký đúng (đúng là Google gọi) nhưng không có gì để cấp — vd. lệnh "Kiểm
// tra URL" trên AdMob console: trả 200 để Google không gọi lại mãi.
test("handleRewardCallback: chữ ký đúng nhưng dữ liệu không dùng được → 200, không cấp", async () => {
  const grant = grantSpy();
  const badData = signedQuery(CONTENT.replace(`user_id=${UID}`, "user_id=abc"));
  assert.equal((await handleRewardCallback({ rawQuery: badData, getKeys: keysOk, grant, rewardCredits: 10 })).status, 200);
  assert.equal(grant.calls.length, 0);
});

test("handleRewardCallback: key_id lạ → tải lại khoá một lần", async () => {
  let loads = 0;
  const getKeys = async ({ refresh } = {}) => { loads++; return refresh ? KEYS : []; };
  const r = await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys, grant: grantSpy(), rewardCredits: 10 });
  assert.equal(r.status, 200);
  assert.equal(loads, 2);
});

test("handleRewardCallback: không tải được khoá / DB lỗi → 500 (Google gọi lại)", async () => {
  const noKeys = async () => { throw new Error("timeout"); };
  assert.equal((await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys: noKeys, grant: grantSpy(), rewardCredits: 10 })).status, 500);
  const dbDown = grantSpy(new Error("db down"));
  assert.equal((await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys: keysOk, grant: dbDown, rewardCredits: 10 })).status, 500);
});

test("handleRewardCallback: người dùng đã xoá tài khoản → 200, không gọi lại mãi", async () => {
  const gone = grantSpy(Object.assign(new Error("fk"), { code: "23503" }));
  assert.equal((await handleRewardCallback({ rawQuery: signedQuery(CONTENT), getKeys: keysOk, grant: gone, rewardCredits: 10 })).status, 200);
});

test("fetchVerifierKeys: nhớ khoá, tải lại tối đa 1 lần/phút (chữ ký giả không làm dồn request tới Google)", async (t) => {
  let n = 0;
  t.mock.method(globalThis, "fetch", async () => {
    n++;
    return Response.json({ keys: [{ keyId: 7, pem: "PEM", base64: "x" }] });
  });
  assert.deepEqual(await fetchVerifierKeys(), [{ keyId: 7, pem: "PEM" }]);
  await fetchVerifierKeys();
  await fetchVerifierKeys({ refresh: true });
  await fetchVerifierKeys({ refresh: true });
  assert.equal(n, 1);
});
