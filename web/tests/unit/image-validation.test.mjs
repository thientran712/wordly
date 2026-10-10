// Kiểm tra ảnh chụp để dịch trước khi gửi cho AI — logic thuần, test không
// cần network. Cùng quy ước với material-validation.test.mjs.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateImageDataUrl, MAX_IMAGE_BYTES } from "../../src/lib/translate/image-validation.js";

function fakeDataUrl(mime, byteSize) {
  // base64 dài hơn ~4/3 kích thước gốc — tạo chuỗi đủ dài để vượt ngưỡng khi cần
  const base64Len = Math.ceil((byteSize * 4) / 3);
  return `data:${mime};base64,${"A".repeat(base64Len)}`;
}

describe("validateImageDataUrl", () => {
  test("chấp nhận ảnh jpeg hợp lệ, dưới giới hạn", () => {
    const result = validateImageDataUrl(fakeDataUrl("image/jpeg", 1024));
    assert.equal(result.error, null);
  });

  test("chấp nhận png, webp, heic", () => {
    for (const mime of ["image/png", "image/webp", "image/heic"]) {
      assert.equal(validateImageDataUrl(fakeDataUrl(mime, 1024)).error, null);
    }
  });

  test("từ chối mime không được hỗ trợ", () => {
    const result = validateImageDataUrl(fakeDataUrl("image/gif", 1024));
    assert.match(result.error, /không hỗ trợ/);
  });

  test("từ chối ảnh vượt quá MAX_IMAGE_BYTES", () => {
    const result = validateImageDataUrl(fakeDataUrl("image/jpeg", MAX_IMAGE_BYTES + 1));
    assert.match(result.error, /quá lớn/);
  });

  test("chấp nhận ảnh đúng ngay ngưỡng MAX_IMAGE_BYTES", () => {
    const result = validateImageDataUrl(fakeDataUrl("image/jpeg", MAX_IMAGE_BYTES - 100));
    assert.equal(result.error, null);
  });

  test("từ chối chuỗi không phải data URL", () => {
    assert.ok(validateImageDataUrl("not-a-data-url").error);
    assert.ok(validateImageDataUrl("").error);
    assert.ok(validateImageDataUrl(null).error);
    assert.ok(validateImageDataUrl(undefined).error);
  });

  test("từ chối data URL sai định dạng (thiếu base64 marker)", () => {
    assert.ok(validateImageDataUrl("data:image/jpeg,notbase64").error);
  });
});
