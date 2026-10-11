import test from "node:test";
import assert from "node:assert/strict";
import { parseConfirmParams } from "../../src/lib/auth/confirm-params.js";

const q = (s) => new URLSearchParams(s);

test("parseConfirmParams: link đặt lại mật khẩu hợp lệ", () => {
  assert.deepEqual(
    parseConfirmParams(q("token_hash=abc123&type=recovery&next=/reset-password")),
    { tokenHash: "abc123", type: "recovery", next: "/reset-password" },
  );
});

test("parseConfirmParams: link xác nhận đăng ký, không có next thì về trang chủ", () => {
  assert.deepEqual(parseConfirmParams(q("token_hash=abc&type=signup")), { tokenHash: "abc", type: "signup", next: "/" });
});

test("parseConfirmParams: thiếu token_hash → null", () => {
  assert.equal(parseConfirmParams(q("type=recovery")), null);
});

test("parseConfirmParams: type lạ → null (không đưa thẳng vào verifyOtp)", () => {
  assert.equal(parseConfirmParams(q("token_hash=abc&type=admin")), null);
});

test("parseConfirmParams: next trỏ ra domain khác bị chặn (open redirect)", () => {
  const r = parseConfirmParams(q("token_hash=abc&type=recovery&next=https://evil.example"));
  assert.equal(r.next, "/");
  const r2 = parseConfirmParams(q("token_hash=abc&type=recovery&next=//evil.example"));
  assert.equal(r2.next, "/");
});
