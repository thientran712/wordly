// Test luồng dịch lai: cache theo câu, chỉ dịch câu còn thiếu, Gemini lỗi
// thì tụt về DeepL. Mọi phụ thuộc mạng/DB đều được tiêm vào nên test chạy
// không cần key hay Postgres.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { hybridTranslate, createTieredCache } from "../../src/lib/translate/hybrid-translate.js";
import { createLruCache } from "../../src/lib/translate/translation-cache.js";

// Cache giả trong bộ nhớ, ghi lại mọi lượt đọc/ghi
function memCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    map,
    writes,
    async getMany(texts) {
      const out = new Map();
      for (const t of texts) if (map.has(t)) out.set(t, map.get(t));
      return out;
    },
    setMany(entries) {
      for (const e of entries) {
        map.set(e.text, e.translated);
        writes.push(e);
      }
    },
  };
}

function engines({ gemini, deepl } = {}) {
  const calls = { gemini: [], deepl: [] };
  return {
    calls,
    gemini: async (texts) => {
      calls.gemini.push(texts);
      return gemini ? gemini(texts) : texts.map((t) => `G(${t})`);
    },
    deepl: async (texts) => {
      calls.deepl.push(texts);
      return deepl ? deepl(texts) : { texts: texts.map((t) => `D(${t})`), detectedLang: "EN" };
    },
  };
}

const base = { source: "EN", target: "VI" };

describe("hybridTranslate — định tuyến", () => {
  test("từ đơn → DeepL, không gọi Gemini", async () => {
    const e = engines();
    const r = await hybridTranslate({ ...base, text: "awkward", cache: memCache(), engines: e });
    assert.equal(r.translated, "D(awkward)");
    assert.equal(r.detectedLang, "EN");
    assert.equal(e.calls.gemini.length, 0);
  });

  test("đoạn văn → Gemini, tất cả câu thiếu trong MỘT lượt gọi, giữ bố cục", async () => {
    const e = engines();
    const r = await hybridTranslate({ ...base, text: "Hello there.\n\nHow are you today?", cache: memCache(), engines: e });
    assert.equal(r.translated, "G(Hello there.)\n\nG(How are you today?)");
    assert.equal(e.calls.gemini.length, 1);
    assert.deepEqual(e.calls.gemini[0], ["Hello there.", "How are you today?"]);
    assert.equal(e.calls.deepl.length, 0);
    assert.equal(r.detectedLang, "EN");
  });
});

describe("hybridTranslate — cache theo câu", () => {
  test("chỉ dịch câu CHƯA có trong cache", async () => {
    const e = engines();
    const cache = memCache({ "Hello there.": "Xin chào." });
    const r = await hybridTranslate({ ...base, text: "Hello there. How are you today?", cache, engines: e });
    assert.equal(r.translated, "Xin chào. G(How are you today?)");
    assert.deepEqual(e.calls.gemini, [["How are you today?"]]);
  });

  test("cache đủ hết → không gọi nhà dịch nào", async () => {
    const e = engines();
    const cache = memCache({ "Hi all.": "A", "Good morning.": "B" });
    const r = await hybridTranslate({ ...base, text: "Hi all. Good morning.", cache, engines: e });
    assert.equal(r.translated, "A B");
    assert.equal(e.calls.gemini.length + e.calls.deepl.length, 0);
  });

  test("câu lặp lại chỉ dịch một lần", async () => {
    const e = engines();
    const r = await hybridTranslate({ ...base, text: "Go now please.\nGo now please.", cache: memCache(), engines: e });
    assert.deepEqual(e.calls.gemini, [["Go now please."]]);
    assert.equal(r.translated, "G(Go now please.)\nG(Go now please.)");
  });

  test("ghi bản dịch mới vào cache kèm engine", async () => {
    const cache = memCache();
    await hybridTranslate({ ...base, text: "One sentence here. Two sentence here.", cache, engines: engines() });
    assert.deepEqual(cache.writes.map((w) => [w.text, w.engine]), [
      ["One sentence here.", "gemini"],
      ["Two sentence here.", "gemini"],
    ]);
    const cache2 = memCache();
    await hybridTranslate({ ...base, text: "awkward", cache: cache2, engines: engines() });
    assert.deepEqual(cache2.writes.map((w) => [w.text, w.translated, w.engine]), [["awkward", "D(awkward)", "deepl"]]);
  });
});

describe("hybridTranslate — Gemini lỗi thì tụt về DeepL", () => {
  const text = "First sentence here. Second sentence here.";

  test("Gemini throw → DeepL với mảng text gốc", async () => {
    const e = engines({ gemini: () => { throw new Error("503"); } });
    const cache = memCache();
    const r = await hybridTranslate({ ...base, text, cache, engines: e });
    assert.equal(r.translated, "D(First sentence here.) D(Second sentence here.)");
    assert.deepEqual(e.calls.deepl, [["First sentence here.", "Second sentence here."]]);
    assert.ok(cache.writes.every((w) => w.engine === "deepl"));
  });

  test("Gemini trả null (sai độ dài / rỗng / hỏng JSON) → DeepL", async () => {
    const e = engines({ gemini: () => null });
    const r = await hybridTranslate({ ...base, text, cache: memCache(), engines: e });
    assert.equal(r.translated, "D(First sentence here.) D(Second sentence here.)");
  });

  test("Gemini trả mảng sai độ dài → DeepL", async () => {
    const e = engines({ gemini: () => ["only one"] });
    const r = await hybridTranslate({ ...base, text, cache: memCache(), engines: e });
    assert.equal(e.calls.deepl.length, 1);
    assert.equal(r.translated, "D(First sentence here.) D(Second sentence here.)");
  });

  test("DeepL cũng lỗi → ném lỗi ra (route trả lỗi như cũ)", async () => {
    const e = engines({
      gemini: () => { throw new Error("x"); },
      deepl: () => { throw Object.assign(new Error("DeepL error: quota"), { status: 456 }); },
    });
    await assert.rejects(hybridTranslate({ ...base, text, cache: memCache(), engines: e }), /quota/);
  });
});

describe("hybridTranslate — cache lỗi KHÔNG được làm hỏng bản dịch", () => {
  test("getMany throw → vẫn dịch bình thường", async () => {
    const cache = { getMany: async () => { throw new Error("db down"); }, setMany: () => {} };
    const r = await hybridTranslate({ ...base, text: "awkward", cache, engines: engines() });
    assert.equal(r.translated, "D(awkward)");
  });

  test("setMany throw → vẫn trả bản dịch", async () => {
    const cache = { getMany: async () => new Map(), setMany: () => { throw new Error("db down"); } };
    const r = await hybridTranslate({ ...base, text: "awkward", cache, engines: engines() });
    assert.equal(r.translated, "D(awkward)");
  });
});

describe("createTieredCache — RAM trước, Postgres sau", () => {
  function fakeStore(rows = {}) {
    const calls = { get: [], set: [] };
    return {
      calls,
      async getMany(keys) {
        calls.get.push(keys);
        const out = new Map();
        for (const k of keys) if (rows[k]) out.set(k, rows[k]);
        return out;
      },
      setMany(entries) { calls.set.push(entries); },
    };
  }
  const keyOf = (t) => `k:${t}`;
  const lru = () => createLruCache({ max: 100, ttlMs: 60_000 });

  test("trúng RAM thì không hỏi Postgres", async () => {
    const store = fakeStore();
    const c = createTieredCache({ lru: lru(), store, keyOf, source: "EN", target: "VI" });
    c.setMany([{ text: "a", translated: "A", engine: "deepl" }]);
    const got = await c.getMany(["a"]);
    assert.equal(got.get("a"), "A");
    assert.equal(store.calls.get.length, 0);
  });

  test("trượt RAM → hỏi Postgres đúng các khoá còn thiếu, rồi nạp vào RAM", async () => {
    const store = fakeStore({ "k:b": "B" });
    const mem = lru();
    const c = createTieredCache({ lru: mem, store, keyOf, source: "EN", target: "VI" });
    c.setMany([{ text: "a", translated: "A", engine: "deepl" }]);
    const got = await c.getMany(["a", "b", "c"]);
    assert.deepEqual(store.calls.get, [["k:b", "k:c"]]);
    assert.equal(got.get("b"), "B");
    assert.equal(got.has("c"), false);
    assert.equal(mem.get("k:b"), "B");
  });

  test("ghi: RAM ngay, Postgres nhận đủ cột", () => {
    const store = fakeStore();
    const c = createTieredCache({ lru: lru(), store, keyOf, source: "EN", target: "VI" });
    c.setMany([{ text: "a", translated: "A", engine: "gemini" }]);
    assert.deepEqual(store.calls.set, [[
      { key: "k:a", source: "EN", target: "VI", source_text: "a", translated_text: "A", engine: "gemini" },
    ]]);
  });

  test("Postgres lỗi khi đọc → coi như trượt, không ném", async () => {
    const store = { getMany: async () => { throw new Error("db down"); }, setMany() {} };
    const c = createTieredCache({ lru: lru(), store, keyOf, source: "EN", target: "VI" });
    const got = await c.getMany(["x"]);
    assert.equal(got.size, 0);
  });

  test("Postgres lỗi khi ghi → RAM vẫn có, không ném", async () => {
    const store = { getMany: async () => new Map(), setMany() { throw new Error("db down"); } };
    const c = createTieredCache({ lru: lru(), store, keyOf, source: "EN", target: "VI" });
    c.setMany([{ text: "a", translated: "A", engine: "deepl" }]);
    assert.equal((await c.getMany(["a"])).get("a"), "A");
  });
});
