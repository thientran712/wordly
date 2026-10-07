// Xoá mềm lịch sử dịch / sổ tay: "Xoá hết" không bao giờ đụng từ đã lưu, và
// mọi thao tác xoá hoàn tác được bằng danh sách id trả về.
//
// Bối cảnh: 7/10/2026 một người dùng bấm nhầm "Xoá hết" → mất toàn bộ từ đã
// lưu (xoá cứng) và project không có backup.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseRestoreIds, clearAllTargets, MAX_RESTORE_IDS } from "../../src/lib/learning/history-delete.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("clearAllTargets", () => {
  test("chỉ lấy dòng CHƯA lưu và chưa bị xoá", () => {
    const rows = [
      { id: "1", is_saved: false, deleted_at: null },
      { id: "2", is_saved: true, deleted_at: null },
      { id: "3", is_saved: false, deleted_at: "2026-10-07T12:00:00Z" },
      { id: "4", is_saved: false },
    ];
    assert.deepEqual(clearAllTargets(rows), ["1", "4"]);
  });

  test("toàn từ đã lưu → không xoá gì", () => {
    assert.deepEqual(clearAllTargets([{ id: "1", is_saved: true }]), []);
  });
});

describe("parseRestoreIds", () => {
  test("nhận mảng uuid hợp lệ, bỏ trùng", () => {
    assert.deepEqual(parseRestoreIds({ ids: [A, B, A] }), { ids: [A, B] });
  });

  test("từ chối body sai dạng", () => {
    assert.ok(parseRestoreIds(null).error);
    assert.ok(parseRestoreIds({}).error);
    assert.ok(parseRestoreIds({ ids: "x" }).error);
    assert.ok(parseRestoreIds({ ids: [] }).error);
  });

  test("từ chối id không phải uuid (chặn chèn bộ lọc)", () => {
    assert.ok(parseRestoreIds({ ids: [A, "1,id.neq.0"] }).error);
  });

  test("giới hạn số id mỗi lần", () => {
    const many = Array.from({ length: MAX_RESTORE_IDS + 1 }, (_, i) =>
      `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`);
    assert.ok(parseRestoreIds({ ids: many }).error);
  });
});
