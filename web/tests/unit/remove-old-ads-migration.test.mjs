// Dọn hệ quảng cáo thưởng cũ (PR #62, đã revert ở #65) — chủ dự án chốt 14/11/2026.
// SQL không chạy được ở máy dev nên kiểm nội dung migration: xoá đủ bảng/hàm cũ,
// thu hẹp usage_daily.kind, và không còn code nào gọi tới.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const file = "supabase/migrations/20261114000100_remove_old_ads.sql";
const sql = () => readFileSync(join(root, file), "utf8");

const TABLES = ["ad_credits", "ad_rewards", "theme_unlocks", "translate_ad_keys", "translate_charges"];
const FUNCS = [
  "translate_quota_today(uuid)",
  "consume_translate(int, uuid)",
  "grant_ad_fallback()",
  "grant_ad_reward(text, uuid, text, text, int)",
  "admin_stats_ads(timestamptz)",
  "refund_translate(uuid)",
];

test("migration xoá đủ 5 bảng và 6 hàm của hệ quảng cáo cũ", () => {
  const s = sql();
  for (const t of TABLES) assert.match(s, new RegExp(`DROP TABLE IF EXISTS public\\.${t}\\b`), t);
  for (const f of FUNCS) {
    const esc = f.replace(/[()]/g, "\\$&");
    assert.match(s, new RegExp(`DROP FUNCTION IF EXISTS public\\.${esc}`), f);
  }
});

test("usage_daily.kind chỉ còn 4 loại đang dùng", () => {
  const s = sql();
  const m = s.match(/ADD CONSTRAINT usage_daily_kind_check\s+CHECK \(kind IN \(([^)]*)\)\)/);
  assert.ok(m, "có ràng buộc mới");
  const kinds = m[1].split(",").map((k) => k.trim().replace(/'/g, "")).sort();
  assert.deepEqual(kinds, ["advanced_translate", "dictionary", "image", "voice"]);
});

test("không còn code web/iOS gọi tới bảng/hàm cũ", () => {
  const re = /ad_credits|ad_rewards|theme_unlocks|translate_ad_keys|translate_charges|consume_translate|grant_ad_|refund_translate|translate_quota_today|admin_stats_ads/;
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs|ts|tsx|swift)$/.test(e.name) && !p.endsWith("remove-old-ads-migration.test.mjs") && re.test(readFileSync(p, "utf8"))) hits.push(p.replace(root, ""));
    }
  };
  for (const d of ["web/src", "web/tests", "mobile/ios/WordlyiOS"]) walk(join(root, d));
  assert.deepEqual(hits, []);
});
