// Ghép suggestion_log với dữ liệu thật (translate_history/journal_entries/words)
// thành item hiển thị cho tab "Đã gợi ý". Tách ra để test không cần DB.
//
// Bug đã sửa (phát hiện ở review cuối nhánh): route cũ SELECT words.def_vi —
// cột này KHÔNG tồn tại ở production (chỉ có def_en, xem select-word-for-email.js
// và BankWords.swift) nên mọi gợi ý từ "bank" bị âm thầm rớt (lỗi query bị
// nuốt, chỉ destructure `data`). Test dưới đảm bảo chỉ dùng def_en.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestionItems } from "../../src/lib/learning/build-suggestion-items.js";

describe("buildSuggestionItems", () => {
  test("ghép translate_history đúng shape", () => {
    const logs = [{ id: "l1", source: "email", entry_type: "translate_history", entry_id: "t1", bank_word_id: null, shown_at: "2026-10-10T00:00:00Z" }];
    const items = buildSuggestionItems(logs, {
      translateRows: [{ id: "t1", source_text: "resilient", translated_text: "kiên cường", state: "new", due_at: null, review_count: 0 }],
      journalRows: [],
      bankRows: [],
    });
    assert.deepEqual(items, [{
      id: "l1", source: "email", entry_type: "translate_history", entry_id: "t1",
      shown_at: "2026-10-10T00:00:00Z", word: "resilient", meaning: "kiên cường",
      state: "new", due_at: null, review_count: 0,
    }]);
  });

  test("ghép journal_entries đúng shape, meaning luôn null", () => {
    const logs = [{ id: "l2", source: "email", entry_type: "journal_entries", entry_id: "j1", bank_word_id: null, shown_at: "2026-10-10T00:00:00Z" }];
    const items = buildSuggestionItems(logs, {
      translateRows: [],
      journalRows: [{ id: "j1", content: "A happy camper", state: "review", due_at: "2026-10-13T00:00:00Z", review_count: 1 }],
      bankRows: [],
    });
    assert.equal(items[0].word, "A happy camper");
    assert.equal(items[0].meaning, null);
  });

  test("ghép bank word — dùng def_en, KHÔNG dùng def_vi (cột không tồn tại ở production)", () => {
    const logs = [{ id: "l3", source: "widget", entry_type: "bank", entry_id: null, bank_word_id: "w1", shown_at: "2026-10-10T00:00:00Z" }];
    const items = buildSuggestionItems(logs, {
      translateRows: [],
      journalRows: [],
      bankRows: [{ id: "w1", word: "resilient", def_en: "able to recover quickly" }],
    });
    assert.equal(items[0].word, "resilient");
    assert.equal(items[0].meaning, "able to recover quickly");
    assert.equal(items[0].state, null);
  });

  test("log tham chiếu row đã bị xoá/không tồn tại thì bỏ qua, không throw", () => {
    const logs = [{ id: "l4", source: "email", entry_type: "translate_history", entry_id: "missing", bank_word_id: null, shown_at: "2026-10-10T00:00:00Z" }];
    const items = buildSuggestionItems(logs, { translateRows: [], journalRows: [], bankRows: [] });
    assert.deepEqual(items, []);
  });

  test("danh sách log rỗng trả về rỗng, không throw", () => {
    assert.deepEqual(buildSuggestionItems([], { translateRows: [], journalRows: [], bankRows: [] }), []);
  });
});
