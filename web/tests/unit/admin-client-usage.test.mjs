import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { restrictToSharedTables, SHARED_TABLES } from "../../src/lib/supabase/shared-tables.js";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "../..");
const API = join(WEB, "src/app/api");

// Route DUY NHẤT được dùng service role đầy đủ (bỏ qua RLS). Thêm route vào
// đây = cần lý do rõ ràng — rò dữ liệu chéo người dùng là sự cố nặng nhất.
const ADMIN_ALLOWED = {
  "account/route.js": "xoá user khỏi auth.users",
  "admin/email-status/route.js": "trang admin xem mọi người dùng",
  "cron/send-emails/route.js": "cron hệ thống, không có người dùng đăng nhập",
  "widget/log-shown/route.js": "suggestion_log chỉ service role được ghi (spec 2026-10-10)",
};

function routeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.js" ? [p] : [];
  });
}

test("chỉ route trong danh sách cho phép mới dùng createAdminClient", () => {
  const offenders = routeFiles(API)
    .filter((f) => readFileSync(f, "utf8").includes("@/lib/supabase/admin"))
    .map((f) => relative(API, f))
    .filter((rel) => !(rel in ADMIN_ALLOWED));
  assert.deepEqual(offenders, [], "dùng createClient() (RLS) hoặc createSharedClient() (bảng dùng chung)");
});

function fakeClient() {
  const calls = [];
  return {
    calls,
    from: (t) => { calls.push(["from", t]); return { table: t }; },
    rpc: (fn) => { calls.push(["rpc", fn]); return { fn }; },
  };
}

test("shared client cho đọc bảng dùng chung", () => {
  const raw = fakeClient();
  const shared = restrictToSharedTables(raw);
  for (const t of ["words", "word_dictionary_cache", "translation_cache", "spinner_topics"]) {
    assert.ok(SHARED_TABLES.has(t));
    assert.deepEqual(shared.from(t), { table: t });
  }
  assert.deepEqual(shared.rpc("bump_rate_limit"), { fn: "bump_rate_limit" });
});

test("shared client chặn bảng dữ liệu riêng của người dùng", () => {
  const shared = restrictToSharedTables(fakeClient());
  for (const t of ["translate_history", "journal_entries", "practice_sessions", "email_slots", "profiles", "user_progress", "spinner_history", "spinner_preferences", "suggestion_log"]) {
    assert.throws(() => shared.from(t), /không phải bảng dùng chung/, t);
  }
});

test("shared client không lộ auth.admin", () => {
  const shared = restrictToSharedTables({ ...fakeClient(), auth: { admin: {} } });
  assert.equal(shared.auth, undefined);
});
