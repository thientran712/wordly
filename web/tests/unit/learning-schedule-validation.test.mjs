// Validation cho PATCH /api/learning/schedule tách thành hàm thuần để test
// không cần DB. entry_type='bank' bị chặn ở đây vì bank word không có row
// translate_history/journal_entries để update.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateScheduleRequest } from "../../src/lib/learning/schedule-adjustment.js";

describe("validateScheduleRequest", () => {
  test("chấp nhận entry_type translate_history hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", entry_id: "abc", rating: "easy" });
    assert.equal(result.error, null);
  });

  test("chấp nhận entry_type journal_entries hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "journal_entries", entry_id: "abc", rating: "hard" });
    assert.equal(result.error, null);
  });

  test("từ chối entry_type bank — không có row để update", () => {
    const result = validateScheduleRequest({ entry_type: "bank", entry_id: "abc", rating: "easy" });
    assert.match(result.error, /bank/i);
  });

  test("từ chối thiếu entry_id", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", rating: "easy" });
    assert.ok(result.error);
  });

  test("từ chối rating không hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", entry_id: "abc", rating: "nope" });
    assert.ok(result.error);
  });
});
