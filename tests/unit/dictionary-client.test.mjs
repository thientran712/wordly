// Test cho việc tra nghĩa từ khi bấm vào một từ trong bài dịch
// (InlineTranslate → /api/dictionary). Đây là tính năng "xem nghĩa từ" mà
// người dùng thật đang dùng.
//
// Lỗi thật phát hiện 4/9/2026:
//
// 1) LỖI BIẾN MẤT KHÔNG DẤU VẾT: `catch { setWordDetail(null) }` cộng với
//    render `{(detailLoading || wordDetail) && ...}` → khi API lỗi, cả khối
//    nghĩa từ biến mất. Người dùng bấm vào từ và KHÔNG THẤY GÌ XẢY RA,
//    không biết là lỗi hay từ đó không có nghĩa. Đây là lý do sự cố Groq
//    ngừng model không ai báo: nó vô hình.
//
// 2) Không phân biệt "từ không có trong từ điển" với "hệ thống lỗi" — hai
//    tình huống cần nói khác nhau.
//
// 3) Cache đầu vào không chuẩn hoá khoảng trắng → " Run " và "run" tính là
//    hai từ khác nhau, gọi API hai lần cho cùng một từ (tốn tiền AI).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lookupWord, normalizeWordKey } from "../../src/lib/dictionary-client.js";

const okDetail = (detail) => ({ ok: true, json: async () => ({ detail }) });

const DETAIL = {
  word: "run", phoneticUs: "/rʌn/", phoneticUk: "/rʌn/",
  meanings: [{ pos: "verb", defs: [{ def: "to move fast", def_vi: "chạy", example: "I run." }] }],
  hasMoreMeanings: false,
};

describe("normalizeWordKey", () => {
  test("chuẩn hoá hoa/thường và khoảng trắng — tránh gọi API trùng", () => {
    assert.equal(normalizeWordKey(" Run "), "run");
    assert.equal(normalizeWordKey("RUN"), "run");
    assert.equal(normalizeWordKey("run"), "run");
  });

  test("chịu được đầu vào rác", () => {
    assert.equal(normalizeWordKey(""), "");
    assert.equal(normalizeWordKey(null), "");
    assert.equal(normalizeWordKey(undefined), "");
  });
});

describe("lookupWord — lỗi phải nhìn thấy được", () => {
  test("thành công → trả detail", async () => {
    const r = await lookupWord("run", { fetchImpl: async () => okDetail(DETAIL) });
    assert.equal(r.error, null);
    assert.equal(r.notFound, false);
    assert.deepEqual(r.detail, DETAIL);
  });

  test("từ không có trong từ điển → notFound, KHÔNG phải error", async () => {
    // API trả {detail: null} khi từ là rác/không phải từ tiếng Anh
    const r = await lookupWord("asdfgh", { fetchImpl: async () => okDetail(null) });
    assert.equal(r.detail, null);
    assert.equal(r.notFound, true, "phải phân biệt với lỗi hệ thống");
    assert.equal(r.error, null);
  });

  test("HTTP 502 (AI chết) → error tiếng Việt, không im lặng", async () => {
    const r = await lookupWord("run", {
      fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({}) }),
    });
    assert.equal(r.detail, null);
    assert.equal(r.notFound, false);
    assert.ok(r.error, "phải có thông báo để UI hiện ra");
    assert.match(r.error, /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
  });

  test("429 hết lượt → nói rõ là chờ, khác lỗi hệ thống", async () => {
    const r = await lookupWord("run", {
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }),
    });
    assert.ok(r.error);
    assert.match(r.error, /chờ|thử lại/i);
  });

  test("lỗi mạng → error, không throw", async () => {
    const r = await lookupWord("run", {
      fetchImpl: async () => { throw new Error("offline"); },
    });
    assert.ok(r.error);
    assert.equal(r.detail, null);
  });

  test("abort (người dùng bấm từ khác) → không content, không error", async () => {
    const r = await lookupWord("run", {
      fetchImpl: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; },
    });
    assert.equal(r.aborted, true);
    assert.equal(r.error, null, "huỷ không phải lỗi — đừng hiện thông báo");
  });

  test("gửi từ đã chuẩn hoá lên API", async () => {
    let body = null;
    await lookupWord(" Run ", { fetchImpl: async (_u, o) => { body = JSON.parse(o.body); return okDetail(DETAIL); } });
    assert.equal(body.word, "run");
  });

  test("từ rỗng → không gọi API", async () => {
    let called = false;
    const r = await lookupWord("   ", { fetchImpl: async () => { called = true; return okDetail(DETAIL); } });
    assert.equal(called, false, "đừng đốt lượt gọi cho chuỗi rỗng");
    assert.equal(r.notFound, true);
  });
});
