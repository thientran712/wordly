import test from "node:test";
import assert from "node:assert/strict";
import { safeRedirectPath } from "../../src/lib/auth/safe-redirect-path.js";

test("safeRedirectPath: chấp nhận path nội bộ hợp lệ", () => {
  assert.equal(safeRedirectPath("/reset-password"), "/reset-password");
  assert.equal(safeRedirectPath("/"), "/");
  assert.equal(safeRedirectPath("/profile?tab=email"), "/profile?tab=email");
});

test("safeRedirectPath: thiếu/null trả về mặc định /", () => {
  assert.equal(safeRedirectPath(null), "/");
  assert.equal(safeRedirectPath(undefined), "/");
  assert.equal(safeRedirectPath(""), "/");
});

test("safeRedirectPath: chặn open redirect qua @ (userinfo trong URL)", () => {
  assert.equal(safeRedirectPath("@evil.com"), "/");
});

test("safeRedirectPath: chặn open redirect qua //  (protocol-relative URL)", () => {
  assert.equal(safeRedirectPath("//evil.com"), "/");
});

test("safeRedirectPath: chặn open redirect qua /\\ (bị trình duyệt hiểu như //)", () => {
  assert.equal(safeRedirectPath("/\\evil.com"), "/");
});

test("safeRedirectPath: chặn path không bắt đầu bằng /", () => {
  assert.equal(safeRedirectPath(".evil.com"), "/");
  assert.equal(safeRedirectPath("evil.com"), "/");
});

test("safeRedirectPath: chặn scheme tuyệt đối (http:, javascript: ...)", () => {
  assert.equal(safeRedirectPath("https://evil.com"), "/");
  assert.equal(safeRedirectPath("javascript:alert(1)"), "/");
});
