// Test cho việc nhận diện người dùng trên route CÔNG KHAI.
//
// Vấn đề tốc độ thật, đo 4/9/2026 trên production:
//   /api/dictionary p50 = 2.68s, nhưng Gemini chỉ mất 1.23s
//   → ~1.45s là phụ trội của hệ thống, không phải AI.
//
// Một phần phụ trội đó: middleware chỉ set header x-user-id khi ĐÃ đăng
// nhập. Khách không có header nên getUserFast() rơi vào fallback gọi mạng
// supabase.auth.getUser() — đo được 0.24-0.79s. Từ điển là route công khai
// nên khách là đường đi phổ biến, và với khách thì danh tính KHÔNG cần
// thiết: rate limit đã tính theo IP.
//
// Nguy hiểm cần chặn: nếu bỏ luôn việc đọc danh tính thì người đã đăng nhập
// bị tụt xuống hạn mức khách (15/phút thay vì 40/phút). Nên phải đọc header
// (rẻ, không mạng) và CHỈ bỏ cú gọi mạng.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { userFromHeaders, shouldVerifyOverNetwork } from "../../src/lib/user-identity.js";

const H = (obj) => ({ get: (k) => obj[k] ?? null });

describe("userFromHeaders — đọc danh tính không gọi mạng", () => {
  test("có x-user-id → trả user", () => {
    const u = userFromHeaders(H({
      "x-user-id": "u1", "x-user-email": "a@b.c", "x-user-provider": "google",
    }));
    assert.deepEqual(u, { id: "u1", email: "a@b.c", provider: "google" });
  });

  test("thiếu email/provider vẫn nhận ra user", () => {
    const u = userFromHeaders(H({ "x-user-id": "u1" }));
    assert.equal(u.id, "u1");
    assert.equal(u.email, null);
  });

  test("không có x-user-id → null (khách)", () => {
    assert.equal(userFromHeaders(H({})), null);
  });
});

describe("shouldVerifyOverNetwork — quyết định có gọi mạng hay không", () => {
  test("route CÔNG KHAI + khách → KHÔNG gọi mạng (đây là phần tiết kiệm)", () => {
    assert.equal(shouldVerifyOverNetwork({ hasHeaderUser: false, isPublicRoute: true }), false);
  });

  test("route công khai + đã có header → không cần gọi mạng", () => {
    assert.equal(shouldVerifyOverNetwork({ hasHeaderUser: true, isPublicRoute: true }), false);
  });

  test("route CẦN ĐĂNG NHẬP + không header → PHẢI gọi mạng (không được nới lỏng bảo mật)", () => {
    // Route protected mà bị gọi trực tiếp không qua middleware thì vẫn phải
    // xác thực thật, không được coi là khách rồi cho qua.
    assert.equal(shouldVerifyOverNetwork({ hasHeaderUser: false, isPublicRoute: false }), true);
  });

  test("mặc định (không nói rõ) là AN TOÀN: vẫn gọi mạng", () => {
    assert.equal(shouldVerifyOverNetwork({}), true,
      "thiếu thông tin thì phải chọn hướng an toàn, không phải hướng nhanh");
  });
});
