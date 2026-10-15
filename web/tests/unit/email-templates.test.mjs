import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Mẫu email GoTrue tải về (GOTRUE_MAILER_TEMPLATES_* trỏ tới /email-templates/*).
// Wordly chỉ còn trên iPhone (web tắt) → email chỉ có mã OTP nhập trong app,
// không còn nút xác nhận / đặt lại mật khẩu qua web (chủ dự án 15/10/2026).
// Hạn mã phải khớp GOTRUE_MAILER_OTP_EXP trên VPS (3600 giây = 60 phút).
const load = (name) => readFile(new URL(`../../public/email-templates/${name}.html`, import.meta.url), "utf8");

for (const name of ["confirmation", "recovery"]) {
  test(`${name}: chỉ có mã OTP, không còn link/nút web`, async () => {
    const html = await load(name);
    assert.match(html, /\{\{ \.Token \}\}/);
    assert.doesNotMatch(html, /TokenHash|ConfirmationURL|\/auth\/confirm/);
    assert.doesNotMatch(html, /trên web|Đăng ký trên web|Đang dùng Wordly trên web/i);
  });

  test(`${name}: ghi rõ hạn mã 60 phút (khớp GOTRUE_MAILER_OTP_EXP=3600)`, async () => {
    const html = await load(name);
    assert.match(html, /60 phút/);
    assert.match(html, /email mới nhất/, "gửi lại thì mã cũ mất hiệu lực — nói rõ để người dùng không nhập mã cũ");
  });

  test(`${name}: là trang HTML đầy đủ, tiếng Việt, có font Plus Jakarta Sans + font dự phòng`, async () => {
    const html = await load(name);
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="vi"/);
    assert.match(html, /Plus Jakarta Sans/);
    assert.match(html, /-apple-system/);
  });
}

test("confirmation: có phần giới thiệu Wordly", async () => {
  const html = await load("confirmation");
  assert.match(html, /Wordly giúp bạn/);
  for (const feature of ["widget", "nhắc ôn", "quiz"]) assert.match(html, new RegExp(feature, "i"), feature);
});
