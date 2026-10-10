// Parse phản hồi AI cho OCR+dịch ảnh — logic thuần, test không cần gọi AI.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseImageTranslateResponse } from "../../src/lib/translate/image-validation.js";

describe("parseImageTranslateResponse", () => {
  test("parse JSON hợp lệ", () => {
    const content = JSON.stringify({ source_text: "Hello world", translated_text: "Xin chào thế giới" });
    const result = parseImageTranslateResponse(content);
    assert.deepEqual(result, { source_text: "Hello world", translated_text: "Xin chào thế giới", error: null });
  });

  test("parse JSON bọc trong ```json fence", () => {
    const content = "```json\n" + JSON.stringify({ source_text: "Hi", translated_text: "Chào" }) + "\n```";
    const result = parseImageTranslateResponse(content);
    assert.equal(result.source_text, "Hi");
    assert.equal(result.translated_text, "Chào");
    assert.equal(result.error, null);
  });

  test("ảnh không có chữ — model trả source_text rỗng", () => {
    const content = JSON.stringify({ source_text: "", translated_text: "" });
    const result = parseImageTranslateResponse(content);
    assert.equal(result.error, "Không tìm thấy chữ trong ảnh");
  });

  test("JSON lỗi/không parse được → error rõ ràng, không throw", () => {
    const result = parseImageTranslateResponse("not json at all");
    assert.ok(result.error);
    assert.equal(result.source_text, null);
  });

  test("thiếu field cần thiết → error, không throw", () => {
    const result = parseImageTranslateResponse(JSON.stringify({ translated_text: "Chào" }));
    assert.ok(result.error);
  });

  test("content không phải string → error, không throw", () => {
    assert.ok(parseImageTranslateResponse(null).error);
    assert.ok(parseImageTranslateResponse(undefined).error);
  });
});
