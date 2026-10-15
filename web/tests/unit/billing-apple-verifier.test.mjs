// Nối thư viện chính thức của Apple + chứng chỉ gốc thật. Không gọi mạng:
// JWS giả mạo bị chặn ngay ở bước kiểm chuỗi chứng chỉ (trước OCSP).
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createHash, X509Certificate } from "node:crypto";
import jwt from "jsonwebtoken";
import { loadAppleRootCerts, getAppleVerifier, verifyApple } from "../../src/lib/billing/apple-verifier.js";

test("chứng chỉ gốc Apple có đủ và đúng (vân tay SHA-256 công bố của Apple)", () => {
  const certs = loadAppleRootCerts();
  assert.equal(certs.length, 2);
  const fps = certs.map((c) => createHash("sha256").update(c).digest("hex").toUpperCase()).sort();
  assert.deepEqual(fps, [
    "63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179", // Apple Root CA - G3
    "B0B1730ECBC7FF4505142C49F1295E6EDA6BCAED7E2C68C5BE91B5A11001F024", // Apple Root CA
  ]);
  for (const c of certs) assert.match(new X509Certificate(c).subject, /Apple/);
});

test("verifier theo môi trường: Production và Sandbox là hai bản riêng, nhớ lại", () => {
  const p = getAppleVerifier("Production");
  const s = getAppleVerifier("Sandbox");
  assert.notEqual(p, s);
  assert.equal(getAppleVerifier("Production"), p);
  assert.throws(() => getAppleVerifier("Xcode"));
});

function forgedJws(payload) {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  // x5c rác: không thể chain tới gốc Apple
  return jwt.sign(payload, privateKey, { algorithm: "ES256", header: { alg: "ES256", x5c: ["AAAA", "BBBB", "CCCC"] } });
}

test("JWS tự ký (không do Apple ký) bị từ chối — giao dịch và thông báo", async () => {
  const tx = { bundleId: "com.thientran.wordly", productId: "wordly.pro.yearly", environment: "Sandbox", appAccountToken: "8a7b6c5d-1111-4222-8333-944455556666" };
  await assert.rejects(verifyApple(forgedJws(tx), "transaction"));
  await assert.rejects(verifyApple(forgedJws({ notificationType: "SUBSCRIBED", data: { environment: "Production", bundleId: "com.thientran.wordly" } }), "notification"));
  await assert.rejects(verifyApple("không.phải.jws", "transaction"));
});
