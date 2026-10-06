// Test cho nội dung AI của thẻ từ vựng (detail từ).
//
// Vì sao test này tồn tại — lỗi thật đo được 9/2026:
//   "run"    → AI trả 3 nghĩa nhưng CẢ 3 đều pos="verb"
//   "record" → có lượt trả [noun, verb, noun]
//   "light"  → [noun, adjective, adjective]
// Người học mở thẻ "run" thì mất hẳn nghĩa danh từ ("a run", cuộc chạy),
// và thấy 3 mục nhìn như trùng nhau → thẻ từ trông như bị lỗi.
//
// Gốc rễ: prompt xin "3 nghĩa phổ biến nhất" nhưng KHÔNG yêu cầu pos phải
// khác nhau — trong khi prompt của api/dictionary thì có yêu cầu đó.
// Đây là lỗi có sẵn từ trước, không phải do chuyển sang Gemini.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildWordContentPrompt, dedupeMeaningsByPos } from "../../src/lib/word-content-prompt.js";

describe("buildWordContentPrompt", () => {
  const prompt = buildWordContentPrompt("run", "verb", "A1", "B1", "daily");

  test("yêu cầu rõ mỗi nghĩa phải có pos KHÁC nhau", () => {
    // Không khẳng định câu chữ cụ thể — chỉ cần prompt có nêu ràng buộc này
    assert.match(prompt, /DIFFERENT "pos"|different part of speech|never repeat the same part of speech/i);
  });

  test("nêu ví dụ từ đa nghĩa để model hiểu ý (run: verb + noun)", () => {
    assert.match(prompt, /\brun\b/);
  });

  test("vẫn giữ nguyên các yêu cầu cũ đang chạy tốt", () => {
    assert.match(prompt, /memory_vi/);
    assert.match(prompt, /phonetic_ipa/);
    assert.match(prompt, /definition_en/);
    assert.match(prompt, /definition_vi/);
    assert.match(prompt, /context "love"/);
    assert.match(prompt, /context "life"/);
    assert.match(prompt, /context "work"/);
    assert.match(prompt, /SYNONYMS/);
    assert.match(prompt, /mày-tao/); // giọng văn đặc trưng của app
  });

  test("nhúng đúng từ, trình độ và mục tiêu học", () => {
    const p = buildWordContentPrompt("resilient", "adjective", "B2", "C1", "ielts");
    assert.match(p, /"resilient"/);
    assert.match(p, /C1/);
    assert.match(p, /academic/i); // GOAL_CONTEXT của ielts
  });
});

describe("dedupeMeaningsByPos — lớp chắn cuối", () => {
  // Prompt tốt lên nhưng model vẫn có thể trả trùng (đã thấy thật).
  // Nên phải có lớp chắn ở code, không phó thác hết cho AI.
  const m = (pos, def) => ({
    pos, phonetic_ipa: "/x/", memory_vi: "v", definition_en: def,
    definition_vi: "v", examples: [{ context: "love", sentence: "s" }],
  });

  test("bỏ nghĩa trùng pos, giữ nghĩa ĐẦU TIÊN (phổ biến nhất)", () => {
    const out = dedupeMeaningsByPos([m("verb", "chạy"), m("verb", "vận hành"), m("noun", "cuộc chạy")]);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((x) => x.pos), ["verb", "noun"]);
    assert.equal(out[0].definition_en, "chạy", "phải giữ nghĩa đầu, không phải nghĩa sau");
  });

  test("không đổi gì khi pos đã khác nhau hết", () => {
    const input = [m("noun", "a"), m("verb", "b"), m("adjective", "c")];
    assert.equal(dedupeMeaningsByPos(input).length, 3);
  });

  test("cắt còn tối đa 3 nghĩa", () => {
    const out = dedupeMeaningsByPos([m("noun","a"), m("verb","b"), m("adjective","c"), m("adverb","d")]);
    assert.equal(out.length, 3);
  });

  test("chuẩn hoá pos trước khi so (VERB / ' verb ' là cùng một thứ)", () => {
    const out = dedupeMeaningsByPos([m("verb", "a"), m("VERB", "b"), m(" verb ", "c")]);
    assert.equal(out.length, 1, "chỉ khác hoa/thường hay khoảng trắng thì vẫn là trùng");
  });

  test("chịu được dữ liệu rác, không được throw", () => {
    assert.deepEqual(dedupeMeaningsByPos([]), []);
    assert.deepEqual(dedupeMeaningsByPos(null), []);
    assert.deepEqual(dedupeMeaningsByPos(undefined), []);
    const out = dedupeMeaningsByPos([m("verb", "a"), { definition_en: "không có pos" }]);
    assert.ok(out.length >= 1, "nghĩa thiếu pos không được làm sập cả thẻ từ");
  });

  test("nghĩa thiếu pos vẫn giữ lại được (thà thiếu nhãn hơn mất nghĩa)", () => {
    const out = dedupeMeaningsByPos([{ definition_en: "x", examples: [] }]);
    assert.equal(out.length, 1);
  });
});
