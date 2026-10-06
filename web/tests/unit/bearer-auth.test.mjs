// Test cho xác thực bằng header Authorization: Bearer (app iOS).
//
// VÌ SAO CẦN: middleware chỉ đọc JWT từ cookie `sb-*-auth-token`. App iOS
// không có cookie, nó gửi `Authorization: Bearer <access_token>` → mọi
// route không công khai trả 401 (đo trên production 6/10/2026:
// /api/stats/streak với Bearer → 401). Toàn bộ app iOS trừ dịch đều chết.
//
// Ràng buộc an toàn:
//   - Cookie LUÔN được ưu tiên. Trình duyệt đã đăng nhập không bao giờ bị
//     đổi danh tính chỉ vì có thêm header Authorization.
//   - Chỉ nhận chuỗi có hình dạng JWT; chữ ký vẫn do getClaims() của SDK
//     kiểm, module này KHÔNG verify gì cả.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  extractBearerToken,
  hasCookieSession,
  bearerToForward,
} from "../../src/lib/auth/bearer-auth.js";

const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJl";

describe("extractBearerToken", () => {
  test("header Bearer hợp lệ → trả token", () => {
    assert.equal(extractBearerToken(`Bearer ${JWT}`), JWT);
  });

  test("không phân biệt hoa thường ở chữ Bearer", () => {
    assert.equal(extractBearerToken(`bearer ${JWT}`), JWT);
  });

  test("thiếu header → null", () => {
    assert.equal(extractBearerToken(null), null);
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(""), null);
  });

  test("scheme khác Bearer → null", () => {
    assert.equal(extractBearerToken(`Basic ${JWT}`), null);
  });

  test("không phải hình dạng JWT → null", () => {
    assert.equal(extractBearerToken("Bearer abc"), null);
    assert.equal(extractBearerToken("Bearer a.b"), null);
    assert.equal(extractBearerToken(`Bearer ${JWT} extra`), null);
    assert.equal(extractBearerToken("Bearer a.b.c$"), null);
  });

  test("token quá dài → null (chặn header khổng lồ)", () => {
    const huge = `${"a".repeat(9000)}.b.c`;
    assert.equal(extractBearerToken(`Bearer ${huge}`), null);
  });
});

describe("hasCookieSession", () => {
  test("có cookie auth của Supabase → true", () => {
    assert.equal(hasCookieSession(["sb-abc-auth-token"]), true);
  });

  test("cookie auth bị chia mảnh (.0, .1) → true", () => {
    assert.equal(hasCookieSession(["sb-abc-auth-token.0", "sb-abc-auth-token.1"]), true);
  });

  test("chỉ có code-verifier hoặc cookie khác → false", () => {
    assert.equal(hasCookieSession(["sb-abc-auth-token-code-verifier", "theme"]), false);
    assert.equal(hasCookieSession([]), false);
  });
});

describe("bearerToForward — quyết định dùng nguồn danh tính nào", () => {
  test("không có cookie + Bearer hợp lệ → dùng Bearer", () => {
    assert.equal(
      bearerToForward({ cookieNames: [], authorizationHeader: `Bearer ${JWT}` }),
      JWT
    );
  });

  test("có cookie session → bỏ qua Bearer, cookie thắng", () => {
    assert.equal(
      bearerToForward({ cookieNames: ["sb-abc-auth-token"], authorizationHeader: `Bearer ${JWT}` }),
      null
    );
  });

  test("không có cookie + không có Bearer → null", () => {
    assert.equal(bearerToForward({ cookieNames: [], authorizationHeader: null }), null);
  });
});
