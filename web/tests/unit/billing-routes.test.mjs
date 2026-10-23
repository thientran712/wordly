// Ranh giới route Wordly Pro: route nào công khai, route nào dùng service role.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => readFileSync(join(WEB, p), "utf8");

function publicApiPaths() {
  const src = read("src/middleware.js");
  const block = src.slice(src.indexOf("PUBLIC_API_PATHS = new Set(["), src.indexOf("]);", src.indexOf("PUBLIC_API_PATHS")));
  return new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

test("webhook Apple + app-config công khai; sync/status cần đăng nhập", () => {
  const pub = publicApiPaths();
  assert.ok(pub.has("/api/billing/notifications"), "Apple gọi webhook không có phiên đăng nhập");
  assert.ok(pub.has("/api/app-config"), "app hỏi min_build trước khi đăng nhập");
  assert.ok(!pub.has("/api/billing/sync"));
  assert.ok(!pub.has("/api/billing/status"));
});

test("quảng cáo: callback SSV công khai; fallback cần đăng nhập", () => {
  const pub = publicApiPaths();
  assert.ok(pub.has("/api/ads/reward-callback"), "Google gọi callback SSV không có phiên đăng nhập");
  assert.ok(!pub.has("/api/ads/fallback"));
  assert.ok(existsSync(join(WEB, "src/app/api/ads/reward-callback/route.js")));
});

test("route billing tồn tại", () => {
  for (const r of ["billing/sync", "billing/notifications", "billing/status", "app-config"]) {
    assert.ok(existsSync(join(WEB, "src/app/api", r, "route.js")), r);
  }
});

test("status/app-config không dùng service role; sync dùng user client để trả status", () => {
  assert.ok(!read("src/app/api/billing/status/route.js").includes("@/lib/supabase/admin"));
  assert.ok(!read("src/app/api/app-config/route.js").includes("@/lib/supabase/admin"));
  assert.ok(read("src/app/api/billing/sync/route.js").includes("@/lib/supabase/server"));
});

test("chứng chỉ Apple được đưa vào bản build standalone", () => {
  const cfg = read("next.config.mjs");
  assert.match(cfg, /outputFileTracingIncludes/);
  assert.match(cfg, /src\/lib\/billing\/certs/);
});
