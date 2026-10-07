// Test cho userOrgsFromClaims — đọc map { org_id: role } từ kết quả getClaims().
//
// VÌ SAO CẦN (6/10/2026): getUserOrgs() gọi getClaims() KHÔNG truyền token →
// SDK chỉ đọc JWT từ cookie. App iOS gửi Bearer, không có cookie → map rỗng →
// mọi API lớp học (orgs, classes, homework…) trả 404 cho học viên dùng iOS.
// Sửa: truyền Bearer vào getClaims; phần đọc claim tách ra đây để test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { userOrgsFromClaims } from "../../src/lib/org/user-orgs.js";

describe("userOrgsFromClaims", () => {
  test("claim user_orgs hợp lệ → trả map", () => {
    const r = { data: { claims: { user_orgs: { "org-1": "student" } } }, error: null };
    assert.deepEqual(userOrgsFromClaims(r), { "org-1": "student" });
  });

  test("có error → {}", () => {
    assert.deepEqual(userOrgsFromClaims({ data: null, error: new Error("x") }), {});
  });

  test("không có claims / không có user_orgs → {}", () => {
    assert.deepEqual(userOrgsFromClaims({ data: null, error: null }), {});
    assert.deepEqual(userOrgsFromClaims({ data: { claims: {} }, error: null }), {});
  });

  test("user_orgs sai kiểu (mảng, chuỗi) → {} (hook cấu hình sai)", () => {
    assert.deepEqual(userOrgsFromClaims({ data: { claims: { user_orgs: ["a"] } } }), {});
    assert.deepEqual(userOrgsFromClaims({ data: { claims: { user_orgs: "a" } } }), {});
  });

  test("đầu vào null/undefined → {}", () => {
    assert.deepEqual(userOrgsFromClaims(null), {});
    assert.deepEqual(userOrgsFromClaims(undefined), {});
  });
});
