// WidgetWordItem.id trên iOS là id của translate_history row cho từ cá nhân,
// hoặc "bank-<uuid>" cho từ kho (xem BankWords.swift: `"bank-\(r.id)"`).
// Cần phân loại đúng để ghi vào suggestion_log (entry_id vs bank_word_id).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWidgetItemId } from "../../src/lib/widget/parse-widget-item-id.js";

describe("parseWidgetItemId", () => {
  test("id thường → translate_history", () => {
    const result = parseWidgetItemId("550e8400-e29b-41d4-a716-446655440000");
    assert.deepEqual(result, {
      entry_type: "translate_history",
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  test("id dạng bank-<uuid> → bank", () => {
    const result = parseWidgetItemId("bank-550e8400-e29b-41d4-a716-446655440000");
    assert.deepEqual(result, {
      entry_type: "bank",
      bank_word_id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  test("id rỗng hoặc không phải string → null", () => {
    assert.equal(parseWidgetItemId(""), null);
    assert.equal(parseWidgetItemId(null), null);
    assert.equal(parseWidgetItemId(undefined), null);
  });

  test("bank- mà không có uuid theo sau → null", () => {
    assert.equal(parseWidgetItemId("bank-"), null);
  });
});
