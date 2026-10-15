import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPool, normalizeWordSource, validateWordSourceBody, DEFAULT_WORD_SOURCE, MAX_PINNED,
} from "../../src/lib/word-source/pool.js";

// Bộ mẫu chung với Swift (spec 2026-10-15 §2.2 mục 4) — hai bên phải ra cùng pool.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fx = JSON.parse(readFileSync(join(ROOT, "shared/fixtures/word-pool-cases.json"), "utf8"));

const ids = (list) => list.map((x) => x.id).sort();
const sorted = (a) => [...a].sort();

function check(c, saved) {
  const pool = buildPool(c.settings, saved, fx.bank);
  assert.deepEqual(ids(pool.personal), sorted(c.expect.personal), `${c.name}: personal`);
  assert.deepEqual(ids(pool.pinned), sorted(c.expect.pinned), `${c.name}: pinned`);
  assert.deepEqual(ids(pool.bank), sorted(c.expect.bank), `${c.name}: bank`);
}

for (const c of fx.cases) test(`pool (mẫu chung): ${c.name}`, () => check(c, fx.saved));
for (const c of fx.empty_saved_cases) test(`pool (mẫu chung, chưa lưu từ): ${c.name}`, () => check(c, []));

test("pool: usesBank cho biết push được lấy từ kho hay không", () => {
  const s = (o) => ({ ...DEFAULT_WORD_SOURCE, ...o });
  assert.equal(buildPool(s({}), fx.saved, []).usesBank, true);
  assert.equal(buildPool(s({ include_bank: false }), fx.saved, []).usesBank, false);
  assert.equal(buildPool(s({ include_bank: false }), [], []).usesBank, true, "chưa lưu từ nào → luôn kho");
  assert.equal(buildPool(s({ pinned_ids: ["s1"], pinned_only: true }), fx.saved, []).usesBank, false);
});

test("normalizeWordSource: chưa có dòng → mặc định", () => {
  assert.deepEqual(normalizeWordSource(null),
    { include_saved: true, include_bank: true, pinned_ids: [], pinned_only: false });
});

test("normalizeWordSource: tắt đã lưu → ép bật kho (không thể tắt cả hai)", () => {
  assert.equal(normalizeWordSource({ include_saved: false, include_bank: false }).include_bank, true);
});

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

test("validateWordSourceBody: hợp lệ → chuẩn hoá, bỏ ghim trùng, giữ thứ tự", () => {
  const v = validateWordSourceBody({ include_saved: true, include_bank: false, pinned_ids: [U2, U1, U2.toUpperCase()], pinned_only: true });
  assert.deepEqual(v, { ok: true, value: { include_saved: true, include_bank: false, pinned_ids: [U2, U1], pinned_only: true } });
});

test("validateWordSourceBody: tắt đã lưu → kho bị ép bật", () => {
  const v = validateWordSourceBody({ include_saved: false, include_bank: false, pinned_ids: [], pinned_only: false });
  assert.equal(v.ok, true);
  assert.equal(v.value.include_bank, true);
});

test("validateWordSourceBody: sai kiểu / quá 30 ghim / id lạ → lỗi", () => {
  const base = { include_saved: true, include_bank: true, pinned_ids: [], pinned_only: false };
  const many = Array.from({ length: MAX_PINNED + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  for (const bad of [
    null, "x", { ...base, include_saved: "yes" }, { ...base, include_bank: 1 }, { ...base, pinned_only: null },
    { ...base, pinned_ids: "a" }, { ...base, pinned_ids: ["s1"] }, { ...base, pinned_ids: [42] }, { ...base, pinned_ids: many },
  ]) {
    assert.equal(validateWordSourceBody(bad).ok, false, JSON.stringify(bad)?.slice(0, 80));
  }
  assert.equal(validateWordSourceBody({ ...base, pinned_ids: many.slice(0, MAX_PINNED) }).ok, true, "đúng 30 thì được");
});
