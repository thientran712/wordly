// Luồng dịch lai: định tuyến DeepL/Gemini + cache THEO CÂU.
//
// Vì sao cache theo câu: client dịch khi đang gõ và gửi CẢ đoạn mỗi lần.
// Cache theo cả đoạn thì gõ thêm một chữ là trượt hết → trả tiền dịch lại
// toàn bộ. Cache theo câu thì chỉ câu đang gõ là mới.
//
// Mọi phụ thuộc mạng/DB được TIÊM vào (engines, cache) để test không cần
// key hay Postgres — xem tests/unit/hybrid-translate.test.mjs.
import { chooseEngine, splitSentences, joinSentences } from "./translate-routing.js";

/**
 * @param text, source, target
 * @param cache   { getMany(texts) → Promise<Map<text, translated>>, setMany([{text, translated, engine}]) }
 * @param engines { gemini(texts) → Promise<string[]|null>, deepl(texts) → Promise<{texts, detectedLang}> }
 * @returns { translated, detectedLang }  — đúng hợp đồng cũ của /api/translate (app iOS dựa vào)
 * Ném lỗi CHỈ khi DeepL (đường lui cuối) lỗi.
 */
export async function hybridTranslate({ text, source, target, cache, engines }) {
  const engine = chooseEngine(text);

  // Từ/cụm ngắn: một "câu" duy nhất là cả đầu vào (đã trim)
  const { leading, parts } =
    engine === "deepl" ? { leading: "", parts: [{ text: text.trim(), trailing: "" }] } : splitSentences(text);

  const unique = [...new Set(parts.map((p) => p.text))];

  // Cache lỗi chỉ làm mất tác dụng cache, KHÔNG được làm hỏng bản dịch
  let found = new Map();
  try {
    found = (await cache.getMany(unique)) || new Map();
  } catch (e) {
    console.warn("[translate] đọc cache lỗi:", e.message);
  }

  const missing = unique.filter((t) => !found.has(t));
  let detectedLang = source;

  if (missing.length) {
    let translated = null;
    let usedEngine = engine;

    if (engine === "gemini") {
      try {
        const out = await engines.gemini(missing);
        if (Array.isArray(out) && out.length === missing.length) translated = out;
      } catch (e) {
        console.warn("[translate] Gemini lỗi, tụt về DeepL:", e.message);
      }
    }

    if (!translated) {
      // DeepL nhận mảng `text` gốc — vẫn giữ đúng thứ tự từng câu
      usedEngine = "deepl";
      const d = await engines.deepl(missing);
      translated = d.texts;
      if (d.detectedLang) detectedLang = d.detectedLang;
    }

    const fresh = missing.map((t, i) => ({ text: t, translated: translated[i], engine: usedEngine }));
    for (const f of fresh) found.set(f.text, f.translated);

    const toStore = fresh.filter((f) => f.translated);
    if (toStore.length) {
      try {
        cache.setMany(toStore);
      } catch (e) {
        console.warn("[translate] ghi cache lỗi:", e.message);
      }
    }
  }

  return {
    translated: joinSentences(leading, parts, parts.map((p) => found.get(p.text) ?? "")),
    detectedLang,
  };
}

/**
 * Cache 2 tầng: LRU trong RAM (nhanh, mất khi deploy) trước, Postgres
 * (bền qua deploy) sau. Lỗi Postgres → coi như trượt / bỏ qua ghi.
 *
 * @param store { getMany(keys) → Promise<Map<key, translated>>, setMany(rows) } — rows đúng cột bảng translation_cache
 * @param keyOf (text) → khoá (đã gồm chiều dịch)
 */
export function createTieredCache({ lru, store, keyOf, source, target }) {
  return {
    async getMany(texts) {
      const out = new Map();
      const missKeys = [];
      const textByKey = new Map();
      for (const t of texts) {
        const k = keyOf(t);
        const hit = lru.get(k);
        if (hit !== undefined) out.set(t, hit);
        else {
          missKeys.push(k);
          textByKey.set(k, t);
        }
      }
      if (!missKeys.length) return out;

      try {
        const rows = (await store.getMany(missKeys)) || new Map();
        for (const [k, translated] of rows) {
          const t = textByKey.get(k);
          if (t === undefined || !translated) continue;
          out.set(t, translated);
          lru.set(k, translated);
        }
      } catch (e) {
        console.warn("[translate] đọc cache Postgres lỗi:", e.message);
      }
      return out;
    },

    setMany(entries) {
      const rows = entries.map(({ text, translated, engine }) => {
        const key = keyOf(text);
        lru.set(key, translated);
        return { key, source, target, source_text: text, translated_text: translated, engine };
      });
      try {
        store.setMany(rows);
      } catch (e) {
        console.warn("[translate] ghi cache Postgres lỗi:", e.message);
      }
    },
  };
}
