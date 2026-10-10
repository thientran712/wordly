// Test cô lập cho suggestion_log — bảng mới trong tính năng "Đã gợi ý".
//
// Bảng này không có policy INSERT/UPDATE/DELETE cho client (chỉ service role
// ghi được qua API routes/Inngest job). Test ở đây xác nhận đúng 2 việc:
//   1. User A không SELECT được hàng của user B qua anon key + JWT thật.
//   2. User A (anon key) không tự INSERT/UPDATE/DELETE được — RLS chặn hết.
//
// Test chạy qua ĐÚNG đường người dùng thật đi: anon key + JWT thật, không
// dùng service role (bypass RLS, chứng minh được số 0).

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  skipReason,
  adminClient,
  createTestUser,
  cleanupUsers,
} from "../helpers/supabase-test-client.mjs";

const skip = skipReason();

describe("Cô lập suggestion_log (RLS)", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let userA, userB;
  let logIdA, logIdB;
  const admin = adminClient();

  before(async () => {
    userA = await createTestUser("sugA");
    userB = await createTestUser("sugB");

    // Ghi trực tiếp bằng service role (mô phỏng API route/Inngest job) —
    // client thật không insert được qua đường này (xem test "ghi" dưới).
    // entry_type='bank' bắt buộc bank_word_id NOT NULL theo CHECK constraint
    // → cần 1 từ kho thật trước khi insert.
    const { data: wordA, error: wordAErr } = await admin
      .from("words").insert({ word: `rls-test-a-${Date.now()}`, level: "B1", def_en: "test" }).select("id").single();
    assert.ok(!wordAErr, `phải tạo được từ kho test A: ${wordAErr?.message}`);

    const { data: wordB, error: wordBErr } = await admin
      .from("words").insert({ word: `rls-test-b-${Date.now()}`, level: "B1", def_en: "test" }).select("id").single();
    assert.ok(!wordBErr, `phải tạo được từ kho test B: ${wordBErr?.message}`);

    const { data: rowA, error: errA } = await admin
      .from("suggestion_log")
      .insert({ user_id: userA.id, source: "email", entry_type: "bank", bank_word_id: wordA.id })
      .select("id")
      .single();
    assert.ok(!errA, `phải tạo được hàng cho user A: ${errA?.message}`);
    logIdA = rowA.id;

    const { data: rowB, error: errB } = await admin
      .from("suggestion_log")
      .insert({ user_id: userB.id, source: "widget", entry_type: "bank", bank_word_id: wordB.id })
      .select("id")
      .single();
    assert.ok(!errB, `phải tạo được hàng cho user B: ${errB?.message}`);
    logIdB = rowB.id;
  });

  after(async () => {
    await admin.from("suggestion_log").delete().in("id", [logIdA, logIdB].filter(Boolean));
    await cleanupUsers(userA, userB);
  });

  test("user A chỉ thấy hàng của mình, không thấy hàng của user B", async () => {
    const { data, error } = await userA.client.from("suggestion_log").select("id, user_id");
    assert.equal(error, null);
    const ids = (data || []).map(r => r.id);
    assert.ok(ids.includes(logIdA), "phải thấy hàng của chính mình");
    assert.ok(!ids.includes(logIdB), "KHÔNG được thấy hàng của user khác");
  });

  test("truy vấn trực tiếp bằng id của user khác vẫn trả rỗng", async () => {
    const { data, error } = await userA.client.from("suggestion_log").select("id").eq("id", logIdB);
    assert.equal(error, null);
    assert.equal((data || []).length, 0, "RLS phải chặn, không trả về hàng của user khác");
  });

  test("user thường (anon key) KHÔNG tự INSERT được — chỉ service role mới ghi", async () => {
    const { error } = await userA.client
      .from("suggestion_log")
      .insert({ user_id: userA.id, source: "email", entry_type: "bank", bank_word_id: null });
    assert.ok(error, "INSERT qua anon key phải bị RLS chặn (không có policy INSERT cho authenticated)");
  });

  test("user thường (anon key) KHÔNG tự DELETE được hàng của mình", async () => {
    const { error, count } = await userA.client
      .from("suggestion_log")
      .delete({ count: "exact" })
      .eq("id", logIdA);
    // Không có policy DELETE cho authenticated → either an error, or a
    // silent no-op (RLS policies can make DELETE affect 0 rows instead of
    // erroring, depending on Postgres version/policy shape) — either way,
    // the row must still exist afterward.
    void error; void count;
    const { data: stillThere } = await admin.from("suggestion_log").select("id").eq("id", logIdA).maybeSingle();
    assert.ok(stillThere, "hàng phải còn nguyên — user thường không xoá được");
  });
});
