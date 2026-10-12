// Test cho phần logic thuần của dịch lai DeepL + Gemini.
//
// Vì sao có: DeepL tính ~$25/1 triệu ký tự và ~95% ký tự đến từ câu, không
// phải từ đơn. Đánh giá mù 75 mục (10/2026): với CÂU, Gemini ngang DeepL;
// với TỪ ĐƠN, Gemini đôi khi bịa từ tiếng Việt không tồn tại (5/40, vd.
// awkward → "vềnh", resilient → "kiên hồi"). Nên: ngắn → DeepL, dài → Gemini.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  chooseEngine,
  splitSentences,
  joinSentences,
  persistentCacheKey,
  buildTranslateSystemPrompt,
  parseGeminiTranslations,
  translateMaxTokens,
} from "../../src/lib/translate/translate-routing.js";

describe("chooseEngine — chọn nhà dịch theo loại đầu vào", () => {
  test("từ đơn / cụm ≤3 từ, không dấu câu → DeepL", () => {
    for (const t of ["awkward", "resilient", "take off", "  look up to  ", "kiên cường", "a piece of"]) {
      assert.equal(chooseEngine(t), "deepl", t);
    }
  });

  test("hơn 3 từ → Gemini", () => {
    assert.equal(chooseEngine("I would like a coffee"), "gemini");
    assert.equal(chooseEngine("tôi muốn uống cà phê sữa"), "gemini");
  });

  // Người dùng hay gõ/dán từ kèm dấu chấm ("resilient.") — vẫn là từ đơn,
  // gửi Gemini là đúng loại đầu vào Gemini hay bịa từ. Ngắn thì luôn DeepL.
  test("≤3 từ dù có dấu kết câu → vẫn DeepL", () => {
    for (const t of ["resilient.", "awkward!", "I love you!", "Are you okay?", "Thank you."]) {
      assert.equal(chooseEngine(t), "deepl", t);
    }
  });

  test("dấu chấm GIỮA token (số thập phân) không phải dấu câu", () => {
    assert.equal(chooseEngine("version 3.5"), "deepl");
  });
});

describe("splitSentences + joinSentences — tách câu, giữ nguyên bố cục", () => {
  const roundTrip = (text) => {
    const { leading, parts } = splitSentences(text);
    return joinSentences(leading, parts, parts.map((p) => p.text));
  };

  test("tách theo . ! ? rồi khoảng trắng + chữ hoa", () => {
    const { parts } = splitSentences("Hello there. How are you? I am fine!");
    assert.deepEqual(parts.map((p) => p.text), ["Hello there.", "How are you?", "I am fine!"]);
  });

  test("ghép lại bằng chính bản gốc thì ra y hệt (giữ khoảng trắng, xuống dòng)", () => {
    for (const t of [
      "Hello there.  How are you?\n\nI am fine!",
      "  Leading space. Then more.  ",
      "Line one\nLine two\n\n  Indented para. Second sentence.",
      "Single sentence without end",
      "Tôi đi học. Bạn thì sao?\nỔn cả.",
    ]) {
      assert.equal(roundTrip(t), t, JSON.stringify(t));
    }
  });

  test("xuống dòng là ranh giới câu, kể cả khi không có dấu chấm", () => {
    const { parts } = splitSentences("Line one\nLine two");
    assert.deepEqual(parts.map((p) => p.text), ["Line one", "Line two"]);
    assert.equal(parts[0].trailing, "\n");
  });

  test("không tách ở số thập phân, chữ viết tắt, hay sau dấu chấm là chữ thường", () => {
    assert.equal(splitSentences("It costs 3.5 dollars today.").parts.length, 1);
    assert.equal(splitSentences("Mr. Smith arrived late.").parts.length, 1);
    assert.equal(splitSentences("Fruits, e.g. apples, are good.").parts.length, 1);
    assert.equal(splitSentences("Wait... what happened").parts.length, 1);
  });

  test("dấu đóng ngoặc/nháy sau dấu chấm vẫn thuộc câu trước", () => {
    const { parts } = splitSentences('He said "Go home." Then he left.');
    assert.deepEqual(parts.map((p) => p.text), ['He said "Go home."', "Then he left."]);
  });

  test("joinSentences dùng bản dịch thay cho câu gốc, giữ phân cách", () => {
    const { leading, parts } = splitSentences("A one.\n\nB two.");
    assert.equal(joinSentences(leading, parts, ["X", "Y"]), "X\n\nY");
  });
});

describe("persistentCacheKey", () => {
  test("hash ổn định, phân biệt chiều dịch, bỏ khoảng trắng đầu cuối, gộp khoảng trắng giữa", () => {
    const k = persistentCacheKey("Hello  world", "EN", "VI");
    assert.match(k, /^[0-9a-f]{64}$/);
    assert.equal(k, persistentCacheKey(" Hello world ", "EN", "VI"));
    assert.notEqual(k, persistentCacheKey("Hello world", "VI", "EN"));
    // Giữ hoa/thường — "US" và "us" dịch khác nhau
    assert.notEqual(persistentCacheKey("US", "EN", "VI"), persistentCacheKey("us", "EN", "VI"));
  });
});

describe("prompt + parse phản hồi Gemini", () => {
  test("prompt nêu đúng chiều dịch và yêu cầu JSON đúng số phần tử", () => {
    const p = buildTranslateSystemPrompt("EN", "VI", 3);
    assert.match(p, /English→Vietnamese translator/);
    assert.match(p, /vocabulary-learning app for Vietnamese learners/);
    assert.match(p, /obvious typo/);
    assert.match(p, /exactly 3/);
    assert.match(buildTranslateSystemPrompt("VI", "EN", 1), /Vietnamese→English/);
  });

  test("parse: mảng đúng độ dài → trả mảng", () => {
    assert.deepEqual(parseGeminiTranslations('{"translations":["a","b"]}', 2), ["a", "b"]);
    // Model đôi khi bọc trong ```json
    assert.deepEqual(parseGeminiTranslations('```json\n{"translations":["a"]}\n```', 1), ["a"]);
  });

  test("parse: sai độ dài / không phải chuỗi / rỗng / hỏng JSON → null", () => {
    assert.equal(parseGeminiTranslations('{"translations":["a"]}', 2), null);
    assert.equal(parseGeminiTranslations('{"translations":["a", 2]}', 2), null);
    assert.equal(parseGeminiTranslations('{"translations":["a", "  "]}', 2), null);
    assert.equal(parseGeminiTranslations('{"other":["a"]}', 1), null);
    assert.equal(parseGeminiTranslations("not json", 1), null);
    assert.equal(parseGeminiTranslations(undefined, 1), null);
  });

  test("max_tokens có chặn trên và chặn dưới", () => {
    assert.ok(translateMaxTokens(10) >= 256);
    assert.ok(translateMaxTokens(10_000) <= 8192);
    assert.ok(translateMaxTokens(2000) > translateMaxTokens(100));
  });
});
