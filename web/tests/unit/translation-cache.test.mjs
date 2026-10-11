import test from "node:test";
import assert from "node:assert/strict";
import { createLruCache, translationCacheKey } from "../../src/lib/translate/translation-cache.js";

test("cache: trả lại giá trị đã lưu", () => {
  const c = createLruCache({ max: 10, ttlMs: 1000, now: () => 0 });
  c.set("a", "x");
  assert.equal(c.get("a"), "x");
  assert.equal(c.get("b"), undefined);
});

test("cache: hết hạn thì bỏ", () => {
  let t = 0;
  const c = createLruCache({ max: 10, ttlMs: 1000, now: () => t });
  c.set("a", "x");
  t = 999;
  assert.equal(c.get("a"), "x");
  t = 1001;
  assert.equal(c.get("a"), undefined);
});

test("cache: đầy thì bỏ mục ít dùng gần đây nhất", () => {
  const c = createLruCache({ max: 2, ttlMs: 1000, now: () => 0 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");      // a vừa dùng → b là mục cũ nhất
  c.set("c", 3);
  assert.equal(c.get("b"), undefined);
  assert.equal(c.get("a"), 1);
  assert.equal(c.get("c"), 3);
});

test("translationCacheKey: chiều dịch khác nhau là khoá khác nhau, bỏ khoảng trắng đầu cuối", () => {
  assert.equal(translationCacheKey(" hello ", "EN", "VI"), translationCacheKey("hello", "EN", "VI"));
  assert.notEqual(translationCacheKey("hello", "EN", "VI"), translationCacheKey("hello", "VI", "EN"));
  // Giữ phân biệt hoa/thường — "US" và "us" dịch khác nhau
  assert.notEqual(translationCacheKey("US", "EN", "VI"), translationCacheKey("us", "EN", "VI"));
});
