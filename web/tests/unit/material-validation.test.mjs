// Test cho logic kiểm tra tài liệu — chạy được không cần database.
//
// Đây là logic BẢO MẬT: safeFileName chặn path traversal (tên file đi thẳng
// vào đường dẫn Storage), isAllowedLink chặn phát tán link lạ cho học viên.
// Sai một trong hai là lỗ bảo mật thật, nên phải có test.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeFileName,
  isAllowedLink,
  validateMaterialSize,
  MAX_BYTES,
} from "../../src/lib/material-validation.js";

describe("safeFileName", () => {
  test("giữ tên file thường và phần mở rộng", () => {
    assert.equal(safeFileName("bai-giang.pdf"), "bai-giang.pdf");
  });

  test("bỏ đường dẫn, chỉ giữ tên file", () => {
    // Nếu không bỏ, tên file sẽ tạo thêm cấp thư mục trong Storage
    assert.equal(safeFileName("folder/sub/file.pdf"), "file.pdf");
    assert.equal(safeFileName("C:\\Users\\me\\file.pdf"), "file.pdf");
  });

  test("chặn path traversal", () => {
    // Đây là ca quan trọng nhất: "../" phải không còn khả năng đi lên cấp trên
    const result = safeFileName("../../../etc/passwd");
    assert.ok(!result.includes(".."), `vẫn còn '..': ${result}`);
    assert.ok(!result.includes("/"), `vẫn còn '/': ${result}`);
    assert.equal(result, "passwd");
  });

  test("bỏ dấu tiếng Việt", () => {
    assert.equal(safeFileName("Bài giảng số 5.pdf"), "Bai-giang-so-5.pdf");
  });

  test("thay ký tự lạ bằng gạch nối, không để gạch nối liên tiếp", () => {
    assert.equal(safeFileName("file!!!@@@name.pdf"), "file-name.pdf");
  });

  test("tên rỗng hoặc thiếu trả về giá trị mặc định", () => {
    assert.equal(safeFileName(""), "file");
    assert.equal(safeFileName(null), "file");
    assert.equal(safeFileName(undefined), "file");
  });

  test("cắt tên quá dài", () => {
    const long = "a".repeat(300) + ".pdf";
    assert.ok(safeFileName(long).length <= 120);
  });
});

describe("isAllowedLink", () => {
  test("cho phép YouTube", () => {
    assert.equal(isAllowedLink("https://www.youtube.com/watch?v=abc123"), true);
    assert.equal(isAllowedLink("https://youtu.be/abc123"), true);
  });

  test("cho phép Google Drive và Docs", () => {
    assert.equal(isAllowedLink("https://drive.google.com/file/d/xyz/view"), true);
    assert.equal(isAllowedLink("https://docs.google.com/document/d/xyz"), true);
  });

  test("từ chối http (không phải https)", () => {
    assert.equal(isAllowedLink("http://www.youtube.com/watch?v=abc"), false);
  });

  test("từ chối host không nằm trong danh sách", () => {
    assert.equal(isAllowedLink("https://evil-site.example.com/malware"), false);
  });

  test("từ chối host trông giống nhưng khác", () => {
    // Chống lừa bằng subdomain: youtube.com.evil.com KHÔNG phải youtube
    assert.equal(isAllowedLink("https://youtube.com.evil.com/x"), false);
    assert.equal(isAllowedLink("https://notyoutube.com/x"), false);
  });

  test("từ chối javascript: và data:", () => {
    assert.equal(isAllowedLink("javascript:alert(1)"), false);
    assert.equal(isAllowedLink("data:text/html,<script>alert(1)</script>"), false);
  });

  test("từ chối giá trị không phải URL", () => {
    assert.equal(isAllowedLink(""), false);
    assert.equal(isAllowedLink(null), false);
    assert.equal(isAllowedLink("không phải url"), false);
  });
});

describe("validateMaterialSize", () => {
  test("chấp nhận file tài liệu trong giới hạn", () => {
    const r = validateMaterialSize("document", 10 * 1024 * 1024);
    assert.equal(r.ok, true);
  });

  test("từ chối tài liệu vượt 50MB", () => {
    const r = validateMaterialSize("document", 60 * 1024 * 1024);
    assert.equal(r.ok, false);
    assert.match(r.error, /50MB/);
  });

  test("audio được phép tới 100MB", () => {
    assert.equal(validateMaterialSize("audio", 90 * 1024 * 1024).ok, true);
    assert.equal(validateMaterialSize("audio", 110 * 1024 * 1024).ok, false);
  });

  test("từ chối dung lượng không hợp lệ", () => {
    assert.equal(validateMaterialSize("document", 0).ok, false);
    assert.equal(validateMaterialSize("document", -5).ok, false);
    assert.equal(validateMaterialSize("document", 1.5).ok, false);
    assert.equal(validateMaterialSize("document", NaN).ok, false);
    assert.equal(validateMaterialSize("document", "1000").ok, false);
  });

  test("từ chối kind không hỗ trợ", () => {
    const r = validateMaterialSize("video", 1000);
    assert.equal(r.ok, false);
  });

  test("MAX_BYTES công khai để UI hiển thị giới hạn", () => {
    assert.equal(MAX_BYTES.document, 50 * 1024 * 1024);
    assert.equal(MAX_BYTES.audio, 100 * 1024 * 1024);
  });
});
