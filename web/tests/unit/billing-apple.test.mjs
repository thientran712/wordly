// Xác thực giao dịch StoreKit 2 + App Store Server Notifications V2 (spec
// 2026-10-16 §4, §8). Verifier của Apple được TIÊM vào (mock) — không gọi
// Apple thật; chữ ký thật do @apple/app-store-server-library kiểm.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUNDLE_ID, PRODUCT_IDS, peekJwsPayload, verifyAppleJws, entitlementFromApple,
  syncTransaction, handleNotification, OTHER_ACCOUNT_BODY,
} from "../../src/lib/billing/apple.js";

const NOW = new Date("2026-10-16T05:00:00Z");
const T = NOW.getTime();
const DAY = 86_400_000;
const USER = "8a7b6c5d-1111-4222-8333-944455556666";
const OTHER = "11111111-2222-4333-8444-555566667777";

const tx = (over = {}) => ({
  bundleId: BUNDLE_ID, productId: "wordly.pro.monthly", originalTransactionId: "2000000111",
  transactionId: "2000000999", appAccountToken: USER, expiresDate: T + 30 * DAY,
  purchaseDate: T - DAY, signedDate: T - 1000, environment: "Sandbox", type: "Auto-Renewable Subscription",
  ...over,
});

// JWS giả: phần payload base64url thật để peekJwsPayload đọc được môi trường.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJws = (payload) => `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;

// Verifier giả: "giải mã" bằng cách tra bảng JWS → payload; chuỗi lạ = sai chữ ký.
function fakeVerify(table) {
  const calls = [];
  const fn = async (jws, what) => {
    calls.push([what, jws]);
    if (!(jws in table)) throw new Error("VerificationException: INVALID_SIGNATURE");
    return table[jws];
  };
  fn.calls = calls;
  return fn;
}
function fakeApply(result = "applied") {
  const rows = [];
  const fn = async (userId, row) => { rows.push([userId, row]); if (result instanceof Error) throw result; return result; };
  fn.rows = rows;
  return fn;
}

test("hằng số đúng app Wordly", () => {
  assert.equal(BUNDLE_ID, "com.thientran.wordly");
  assert.deepEqual([...PRODUCT_IDS].sort(), ["wordly.pro.monthly", "wordly.pro.yearly"]);
});

test("peekJwsPayload: đọc payload không xác thực (chỉ để chọn môi trường), rác → null", () => {
  assert.deepEqual(peekJwsPayload(fakeJws({ environment: "Sandbox" })), { environment: "Sandbox" });
  assert.equal(peekJwsPayload("abc"), null);
  assert.equal(peekJwsPayload(null), null);
});

test("verifyAppleJws: chọn verifier theo môi trường trong JWS; không rõ → thử Production rồi Sandbox", async () => {
  const seen = [];
  const getVerifier = (env) => ({
    verifyAndDecodeTransaction: async (jws) => { seen.push(env); if (env !== "Sandbox") throw new Error("INVALID_ENVIRONMENT"); return { ok: env }; },
  });
  assert.deepEqual(await verifyAppleJws(fakeJws({ environment: "Sandbox" }), "transaction", getVerifier), { ok: "Sandbox" });
  assert.deepEqual(seen, ["Sandbox"]);
  seen.length = 0;
  assert.deepEqual(await verifyAppleJws(fakeJws({}), "transaction", getVerifier), { ok: "Sandbox" });
  assert.deepEqual(seen, ["Production", "Sandbox"]);
  seen.length = 0;
  await assert.rejects(verifyAppleJws(fakeJws({ environment: "Production" }), "transaction", getVerifier));
  assert.deepEqual(seen, ["Production"], "JWS ghi Production thì không thử Sandbox");
});

test("verifyAppleJws: thông báo đọc môi trường ở data.environment", async () => {
  const seen = [];
  const getVerifier = (env) => ({ verifyAndDecodeNotification: async () => { seen.push(env); return {}; } });
  await verifyAppleJws(fakeJws({ data: { environment: "Production" } }), "notification", getVerifier);
  assert.deepEqual(seen, ["Production"]);
});

// ── Trạng thái từ giao dịch Apple ────────────────────────────────────────────
test("entitlementFromApple: giao dịch còn hạn", () => {
  const r = entitlementFromApple({ tx: tx(), now: NOW, eventAt: T });
  assert.deepEqual(r, {
    source: "app_store", product_id: "wordly.pro.monthly", original_transaction_id: "2000000111",
    expires_at: new Date(T + 30 * DAY).toISOString(), in_grace: false, grace_expires_at: null,
    auto_renew: null, environment: "Sandbox", event_at: new Date(T).toISOString(),
  });
});

test("entitlementFromApple: bị hoàn tiền/thu hồi → hết hạn tại revocationDate, không ân hạn", () => {
  const r = entitlementFromApple({ tx: tx({ revocationDate: T - 3600_000 }), renewal: { gracePeriodExpiresDate: T + DAY }, type: "REFUND", now: NOW, eventAt: T });
  assert.equal(r.expires_at, new Date(T - 3600_000).toISOString());
  assert.equal(r.in_grace, false);
  assert.equal(r.auto_renew, false);
});

test("entitlementFromApple: REFUND/REVOKE thiếu revocationDate → hết hạn lúc sự kiện", () => {
  for (const type of ["REFUND", "REVOKE"]) {
    const r = entitlementFromApple({ tx: tx(), type, now: NOW, eventAt: T - 5000 });
    assert.equal(r.expires_at, new Date(T - 5000).toISOString(), type);
  }
});

test("entitlementFromApple: DID_FAIL_TO_RENEW/GRACE_PERIOD → ân hạn tới gracePeriodExpiresDate", () => {
  const r = entitlementFromApple({
    tx: tx({ expiresDate: T - DAY }), renewal: { gracePeriodExpiresDate: T + 6 * DAY, autoRenewStatus: 1 },
    type: "DID_FAIL_TO_RENEW", subtype: "GRACE_PERIOD", now: NOW, eventAt: T,
  });
  assert.equal(r.in_grace, true);
  assert.equal(r.grace_expires_at, new Date(T + 6 * DAY).toISOString());
  assert.equal(r.auto_renew, true);
});

test("entitlementFromApple: GRACE_PERIOD thiếu mốc → ân hạn 16 ngày từ hết hạn", () => {
  const r = entitlementFromApple({ tx: tx({ expiresDate: T - DAY }), type: "DID_FAIL_TO_RENEW", subtype: "GRACE_PERIOD", now: NOW, eventAt: T });
  assert.equal(r.grace_expires_at, new Date(T - DAY + 16 * DAY).toISOString());
});

test("entitlementFromApple: renewal còn mốc ân hạn tương lai → ân hạn (kể cả loại khác)", () => {
  const r = entitlementFromApple({ tx: tx({ expiresDate: T - DAY }), renewal: { gracePeriodExpiresDate: T + DAY }, type: "DID_CHANGE_RENEWAL_STATUS", now: NOW, eventAt: T });
  assert.equal(r.in_grace, true);
});

test("entitlementFromApple: DID_FAIL_TO_RENEW không ân hạn (billing retry) / GRACE_PERIOD_EXPIRED / EXPIRED → hết ân hạn", () => {
  for (const [type, subtype] of [["DID_FAIL_TO_RENEW", undefined], ["GRACE_PERIOD_EXPIRED", undefined], ["EXPIRED", "VOLUNTARY"]]) {
    const r = entitlementFromApple({ tx: tx({ expiresDate: T - DAY }), renewal: { gracePeriodExpiresDate: T - 1 }, type, subtype, now: NOW, eventAt: T });
    assert.equal(r.in_grace, false, type);
  }
  assert.equal(entitlementFromApple({ tx: tx({ expiresDate: T - DAY }), type: "EXPIRED", now: NOW, eventAt: T }).auto_renew, false);
});

test("entitlementFromApple: DID_CHANGE_RENEWAL_STATUS đổi auto_renew", () => {
  assert.equal(entitlementFromApple({ tx: tx(), type: "DID_CHANGE_RENEWAL_STATUS", subtype: "AUTO_RENEW_DISABLED", now: NOW, eventAt: T }).auto_renew, false);
  assert.equal(entitlementFromApple({ tx: tx(), type: "DID_CHANGE_RENEWAL_STATUS", subtype: "AUTO_RENEW_ENABLED", now: NOW, eventAt: T }).auto_renew, true);
  assert.equal(entitlementFromApple({ tx: tx(), renewal: { autoRenewStatus: 0 }, type: "DID_RENEW", now: NOW, eventAt: T }).auto_renew, false);
});

// ── POST /api/billing/sync ───────────────────────────────────────────────────
const syncWith = (payload, { apply = fakeApply(), userId = USER } = {}) =>
  syncTransaction({ signedTransaction: "JWS", userId, verify: fakeVerify({ JWS: payload }), apply, now: NOW });

test("sync: giao dịch hợp lệ → ghi entitlement đúng người, 200", async () => {
  const apply = fakeApply();
  const r = await syncWith(tx(), { apply });
  assert.equal(r.status, 200);
  assert.equal(apply.rows.length, 1);
  assert.equal(apply.rows[0][0], USER);
  assert.equal(apply.rows[0][1].original_transaction_id, "2000000111");
  assert.equal(apply.rows[0][1].environment, "Sandbox");
});

test("sync: appAccountToken viết hoa vẫn khớp user id", async () => {
  assert.equal((await syncWith(tx({ appAccountToken: USER.toUpperCase() }))).status, 200);
});

test("sync: sai chữ ký / thiếu / không phải chuỗi → 400, không ghi", async () => {
  const apply = fakeApply();
  const bad = await syncTransaction({ signedTransaction: "rác", userId: USER, verify: fakeVerify({}), apply, now: NOW });
  assert.equal(bad.status, 400);
  for (const s of [undefined, 123, ""]) {
    assert.equal((await syncTransaction({ signedTransaction: s, userId: USER, verify: fakeVerify({}), apply, now: NOW })).status, 400);
  }
  assert.equal(apply.rows.length, 0);
});

test("sync: bundle khác / sản phẩm lạ / thiếu appAccountToken → 400", async () => {
  for (const over of [{ bundleId: "com.other.app" }, { productId: "wordly.lifetime" }, { appAccountToken: undefined }]) {
    const apply = fakeApply();
    const r = await syncWith(tx(over), { apply });
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(apply.rows.length, 0);
  }
});

test("sync: appAccountToken của tài khoản khác → 409 subscription_other_account, không ghi", async () => {
  const apply = fakeApply();
  const r = await syncWith(tx({ appAccountToken: OTHER }), { apply });
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, OTHER_ACCOUNT_BODY);
  assert.deepEqual(OTHER_ACCOUNT_BODY, {
    error: "Gói Pro này đang gắn với một tài khoản Wordly khác. Hãy đăng nhập đúng tài khoản đã mua.",
    code: "subscription_other_account",
  });
  assert.equal(apply.rows.length, 0);
});

test("sync: original_transaction_id đã gắn tài khoản khác (DB trả other_account) → 409", async () => {
  const r = await syncWith(tx(), { apply: fakeApply("other_account") });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "subscription_other_account");
});

test("sync: giao dịch đã hết hạn → không cấp Pro, không ghi đè (thông báo Apple lo hạ cấp)", async () => {
  const apply = fakeApply();
  const r = await syncWith(tx({ expiresDate: T - 1 }), { apply });
  assert.equal(r.status, 200);
  assert.equal(apply.rows.length, 0);
});

test("sync: giao dịch bị hoàn tiền → ghi để thu hồi Pro (hết hạn tại revocationDate)", async () => {
  const apply = fakeApply();
  await syncWith(tx({ revocationDate: T - 1000 }), { apply });
  assert.equal(apply.rows.length, 1);
  assert.equal(apply.rows[0][1].expires_at, new Date(T - 1000).toISOString());
});

// ── POST /api/billing/notifications ──────────────────────────────────────────
function notif(type, { subtype, txOver = {}, renewal, signedDate = T } = {}) {
  const table = { NOTIF: { notificationType: type, subtype, signedDate, notificationUUID: "n1", data: { signedTransactionInfo: "TX", ...(renewal && { signedRenewalInfo: "RN" }) } }, TX: tx(txOver) };
  if (renewal) table.RN = renewal;
  return table;
}
const runNotif = (table, { apply = fakeApply(), findUserByOtid = async () => null } = {}) =>
  handleNotification({ signedPayload: "NOTIF", verify: fakeVerify(table), apply, findUserByOtid, now: NOW });

test("notifications: sai chữ ký → 400", async () => {
  const r = await handleNotification({ signedPayload: "xx", verify: fakeVerify({}), apply: fakeApply(), findUserByOtid: async () => null, now: NOW });
  assert.equal(r.status, 400);
  assert.equal((await handleNotification({ signedPayload: undefined, verify: fakeVerify({}), apply: fakeApply(), findUserByOtid: async () => null, now: NOW })).status, 400);
});

test("notifications: giao dịch lồng bên trong sai chữ ký → 400", async () => {
  const table = notif("DID_RENEW");
  delete table.TX;
  assert.equal((await runNotif(table)).status, 400);
});

test("notifications: loại lạ / TEST → 200, không ghi", async () => {
  for (const type of ["TEST", "PRICE_INCREASE", "CONSUMPTION_REQUEST", "WHATEVER"]) {
    const apply = fakeApply();
    const r = await runNotif(notif(type), { apply });
    assert.equal(r.status, 200, type);
    assert.equal(apply.rows.length, 0, type);
  }
});

const cases = [
  ["SUBSCRIBED", { subtype: "INITIAL_BUY" }, (row) => assert.equal(row.expires_at, new Date(T + 30 * DAY).toISOString())],
  ["DID_RENEW", {}, (row) => assert.equal(row.in_grace, false)],
  ["DID_CHANGE_RENEWAL_STATUS", { subtype: "AUTO_RENEW_DISABLED" }, (row) => assert.equal(row.auto_renew, false)],
  ["DID_FAIL_TO_RENEW", { subtype: "GRACE_PERIOD", txOver: { expiresDate: T - DAY }, renewal: { gracePeriodExpiresDate: T + 5 * DAY } },
    (row) => { assert.equal(row.in_grace, true); assert.equal(row.grace_expires_at, new Date(T + 5 * DAY).toISOString()); }],
  ["GRACE_PERIOD_EXPIRED", { txOver: { expiresDate: T - DAY } }, (row) => assert.equal(row.in_grace, false)],
  ["EXPIRED", { subtype: "VOLUNTARY", txOver: { expiresDate: T - DAY } }, (row) => assert.equal(row.expires_at, new Date(T - DAY).toISOString())],
  ["REFUND", { txOver: { revocationDate: T - 60_000 } }, (row) => assert.equal(row.expires_at, new Date(T - 60_000).toISOString())],
  ["REVOKE", { txOver: { revocationDate: T - 60_000 } }, (row) => assert.equal(row.expires_at, new Date(T - 60_000).toISOString())],
];
for (const [type, opts, check] of cases) {
  test(`notifications ${type}: ghi đúng trạng thái cho đúng người, 200`, async () => {
    const apply = fakeApply();
    const r = await runNotif(notif(type, opts), { apply });
    assert.equal(r.status, 200);
    assert.equal(apply.rows.length, 1);
    assert.equal(apply.rows[0][0], USER);
    assert.equal(apply.rows[0][1].event_at, new Date(T).toISOString(), "thứ tự sự kiện theo signedDate của thông báo");
    check(apply.rows[0][1]);
  });
}

test("notifications: thiếu appAccountToken → tìm người theo original_transaction_id", async () => {
  const apply = fakeApply();
  const seen = [];
  const r = await runNotif(notif("DID_RENEW", { txOver: { appAccountToken: undefined } }), {
    apply, findUserByOtid: async (otid) => { seen.push(otid); return USER; },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ["2000000111"]);
  assert.equal(apply.rows[0][0], USER);
});

test("notifications: không tìm được người → 200, không ghi", async () => {
  const apply = fakeApply();
  const r = await runNotif(notif("DID_RENEW", { txOver: { appAccountToken: undefined } }), { apply });
  assert.equal(r.status, 200);
  assert.equal(apply.rows.length, 0);
});

test("notifications: sản phẩm lạ → 200, không ghi", async () => {
  const apply = fakeApply();
  assert.equal((await runNotif(notif("DID_RENEW", { txOver: { productId: "x" } }), { apply })).status, 200);
  assert.equal(apply.rows.length, 0);
});

test("notifications: lặp lại / tới trễ (stale) / gói của người khác → vẫn 200 (Apple không gửi lại)", async () => {
  for (const result of ["applied", "stale", "other_account"]) {
    assert.equal((await runNotif(notif("DID_RENEW"), { apply: fakeApply(result) })).status, 200, result);
  }
});

test("notifications: người dùng đã xoá (FK 23503) → 200; lỗi DB khác → 500 để Apple gửi lại", async () => {
  const fk = Object.assign(new Error("fk"), { code: "23503" });
  assert.equal((await runNotif(notif("DID_RENEW"), { apply: fakeApply(fk) })).status, 200);
  assert.equal((await runNotif(notif("DID_RENEW"), { apply: fakeApply(new Error("db down")) })).status, 500);
});
