import test from "node:test";
import assert from "node:assert/strict";
import { CURRENT_TERMS_VERSION, parseConsentBody, needsConsent } from "../../src/lib/legal/terms.js";

// Đồng ý Điều khoản + Chính sách (spec 2026-10-15-terms-consent-design.md).
// Nghị định 13/2023 Điều 11: im lặng không phải đồng ý → người dùng tự bấm,
// server ghi phiên bản + thời điểm.

test("phiên bản hiện tại là số nguyên dương", () => {
  assert.ok(Number.isInteger(CURRENT_TERMS_VERSION) && CURRENT_TERMS_VERSION >= 1);
});

test("parseConsentBody: chỉ nhận đúng phiên bản hiện tại", () => {
  assert.deepEqual(parseConsentBody({ version: CURRENT_TERMS_VERSION }), { version: CURRENT_TERMS_VERSION });
  // Bản cũ hơn (khi đã lên ≥ 2) → "outdated"; 0/âm không phải phiên bản → "invalid"
  if (CURRENT_TERMS_VERSION > 1) assert.equal(parseConsentBody({ version: CURRENT_TERMS_VERSION - 1 }).error, "outdated");
  assert.equal(parseConsentBody({ version: 0 }).error, "invalid");
  assert.equal(parseConsentBody({ version: 1 }, 2).error, "outdated");
  assert.deepEqual(parseConsentBody({ version: 2 }, 2), { version: 2 });
  assert.equal(parseConsentBody({ version: CURRENT_TERMS_VERSION + 1 }).error, "invalid");
  for (const bad of [null, undefined, {}, { version: "1" }, { version: 1.5 }, "x"]) {
    assert.equal(parseConsentBody(bad).error, "invalid", JSON.stringify(bad));
  }
});

test("needsConsent: chưa có hoặc phiên bản cũ hơn → cần hỏi", () => {
  assert.equal(needsConsent(null), true);
  assert.equal(needsConsent({}), true);
  assert.equal(needsConsent({ terms_version: null }), true);
  assert.equal(needsConsent({ terms_version: CURRENT_TERMS_VERSION - 1 }), true);
  assert.equal(needsConsent({ terms_version: CURRENT_TERMS_VERSION }), false);
});

import { readFileSync } from "node:fs";

// Quảng cáo (spec 2026-10-23): điều khoản + chính sách đổi theo cách người
// dùng cần biết → bản 2, app hỏi đồng ý lại một lần.
test("điều khoản bản 2 nói rõ lượt dịch + quảng cáo; chính sách nêu AdMob", () => {
  assert.equal(CURRENT_TERMS_VERSION, 2);
  const terms = readFileSync(new URL("../../src/app/terms/page.js", import.meta.url), "utf8");
  assert.match(terms, /10 lượt dịch/);
  assert.match(terms, /không quy đổi/);
  const privacy = readFileSync(new URL("../../src/app/privacy/page.js", import.meta.url), "utf8");
  assert.match(privacy, /Google AdMob/);
  assert.match(privacy, /IDFA/);
});
