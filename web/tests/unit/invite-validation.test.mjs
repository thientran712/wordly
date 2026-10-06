// Test cho logic mời thành viên. Chạy được không cần database.
//
// Mời qua email là đường vào tổ chức, nên validate phải chắc: email sai định
// dạng, danh sách trùng, vai trò không hợp lệ, và giới hạn số lượng một lần.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parseInviteList,
  isValidOrgRole,
  MAX_INVITES_PER_REQUEST,
} from "../../src/lib/invite-validation.js";

describe("isValidOrgRole", () => {
  test("chấp nhận vai trò hợp lệ", () => {
    for (const r of ["owner", "teacher", "student", "parent"]) {
      assert.equal(isValidOrgRole(r), true, `${r} phải hợp lệ`);
    }
  });

  test("từ chối vai trò không có trong hệ thống", () => {
    assert.equal(isValidOrgRole("admin"), false);
    assert.equal(isValidOrgRole("superuser"), false);
    assert.equal(isValidOrgRole(""), false);
    assert.equal(isValidOrgRole(null), false);
    assert.equal(isValidOrgRole("OWNER"), false); // phân biệt chữ hoa
  });
});

describe("parseInviteList", () => {
  test("nhận mảng email và chuẩn hoá về chữ thường", () => {
    const r = parseInviteList(["A@Example.COM", "b@test.vn"]);
    assert.deepEqual(r.emails, ["a@example.com", "b@test.vn"]);
    assert.equal(r.invalid.length, 0);
  });

  test("nhận chuỗi nhiều email cách nhau bởi dấu phẩy, xuống dòng, hoặc chấm phẩy", () => {
    const r = parseInviteList("a@x.com, b@x.com\nc@x.com; d@x.com");
    assert.deepEqual(r.emails, ["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  test("bỏ khoảng trắng thừa", () => {
    const r = parseInviteList("  a@x.com  ,  b@x.com  ");
    assert.deepEqual(r.emails, ["a@x.com", "b@x.com"]);
  });

  test("loại email trùng (giữ thứ tự lần đầu xuất hiện)", () => {
    const r = parseInviteList("a@x.com, b@x.com, A@X.COM");
    assert.deepEqual(r.emails, ["a@x.com", "b@x.com"]);
  });

  test("tách riêng email sai định dạng thay vì bỏ im lặng", () => {
    // Quan trọng: người dùng phải biết dòng nào sai, không thể âm thầm bỏ
    const r = parseInviteList("hop-le@x.com, sai-dinh-dang, @thieu-ten.com");
    assert.deepEqual(r.emails, ["hop-le@x.com"]);
    assert.equal(r.invalid.length, 2);
    assert.ok(r.invalid.includes("sai-dinh-dang"));
  });

  test("danh sách rỗng trả về mảng rỗng, không lỗi", () => {
    assert.deepEqual(parseInviteList("").emails, []);
    assert.deepEqual(parseInviteList([]).emails, []);
    assert.deepEqual(parseInviteList(null).emails, []);
  });

  test("giới hạn số lượng mỗi lần mời", () => {
    const many = Array.from({ length: MAX_INVITES_PER_REQUEST + 10 }, (_, i) => `u${i}@x.com`);
    const r = parseInviteList(many);
    assert.equal(r.emails.length, MAX_INVITES_PER_REQUEST);
    assert.ok(r.truncated, "phải báo là đã bị cắt");
  });

  test("không bị cắt khi trong giới hạn", () => {
    const r = parseInviteList(["a@x.com"]);
    assert.equal(r.truncated, false);
  });

  test("từ chối email quá dài", () => {
    const long = "a".repeat(300) + "@x.com";
    const r = parseInviteList([long]);
    assert.equal(r.emails.length, 0);
    assert.equal(r.invalid.length, 1);
  });
});
