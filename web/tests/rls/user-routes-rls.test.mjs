// Các route của người dùng đã bỏ service role, giờ đi qua anon key + JWT
// (createClient). Test xác nhận đúng những thao tác route cần đều làm được
// trên dữ liệu CỦA MÌNH, và không chạm được dữ liệu người khác.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers } from "../helpers/supabase-test-client.mjs";

const skip = skipReason();

describe("Route người dùng chạy được qua RLS", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b;

  before(async () => {
    a = await createTestUser("routeA");
    b = await createTestUser("routeB");
  });
  after(() => cleanupUsers(a, b));

  test("spinner_preferences: upsert + đọc của mình, người khác không thấy", async () => {
    const { error } = await a.client.from("spinner_preferences")
      .upsert({ user_id: a.id, language: "en", difficulty: "easy", updated_at: new Date().toISOString() });
    assert.ok(!error, error?.message);
    const { data: own } = await a.client.from("spinner_preferences").select("difficulty").eq("user_id", a.id).maybeSingle();
    assert.equal(own?.difficulty, "easy");
    const { data: other } = await b.client.from("spinner_preferences").select("user_id").eq("user_id", a.id);
    assert.deepEqual(other, []);
  });

  test("spinner_preferences: không ghi hộ người khác", async () => {
    const { error } = await b.client.from("spinner_preferences")
      .upsert({ user_id: a.id, language: "vi", difficulty: "hard", updated_at: new Date().toISOString() });
    assert.ok(error, "phải bị RLS chặn");
  });

  test("spinner_history: thêm, đọc, xoá của mình; người khác không thấy/xoá được", async () => {
    const ins = await a.client.from("spinner_history").insert({ user_id: a.id, item_id: 1, item_type: "topic" });
    assert.ok(!ins.error, ins.error?.message);
    const { data: own } = await a.client.from("spinner_history").select("item_id").eq("user_id", a.id);
    assert.equal(own.length, 1);

    const { data: seenByB } = await b.client.from("spinner_history").select("id").eq("user_id", a.id);
    assert.deepEqual(seenByB, []);
    await b.client.from("spinner_history").delete().eq("user_id", a.id);
    const { data: still } = await a.client.from("spinner_history").select("id").eq("user_id", a.id);
    assert.equal(still.length, 1, "B không xoá được lịch sử của A");

    const forged = await b.client.from("spinner_history").insert({ user_id: a.id, item_id: 2, item_type: "topic" });
    assert.ok(forged.error, "B không ghi hộ A được");

    const del = await a.client.from("spinner_history").delete().eq("user_id", a.id).eq("item_id", 1);
    assert.ok(!del.error, del.error?.message);
  });

  test("email_slots: thêm, đếm, sửa, xoá của mình; người khác không sửa được", async () => {
    const { data: slot, error } = await a.client.from("email_slots")
      .insert({ user_id: a.id, send_time: "08:00", enabled: true }).select().single();
    assert.ok(!error, error?.message);
    const { count } = await a.client.from("email_slots").select("id", { count: "exact", head: true }).eq("user_id", a.id);
    assert.equal(count, 1);

    const { data: changedByB } = await b.client.from("email_slots").update({ enabled: false }).eq("id", slot.id).select("id");
    assert.deepEqual(changedByB, []);
    const forged = await b.client.from("email_slots").insert({ user_id: a.id, send_time: "09:00" });
    assert.ok(forged.error, "B không tạo slot hộ A được");

    const { data: changed } = await a.client.from("email_slots").update({ enabled: false }).eq("id", slot.id).select("enabled");
    assert.deepEqual(changed, [{ enabled: false }]);
    const del = await a.client.from("email_slots").delete().eq("id", slot.id);
    assert.ok(!del.error, del.error?.message);
  });

  test("practice_sessions: tạo, đổi tên, đọc của mình; người khác không thấy", async () => {
    const { data: s, error } = await a.client.from("practice_sessions")
      .insert({ user_id: a.id, messages: [] }).select("id").single();
    assert.ok(!error, error?.message);
    const { data: renamed } = await a.client.from("practice_sessions").update({ title: "Coffee" }).eq("id", s.id).select("title");
    assert.deepEqual(renamed, [{ title: "Coffee" }]);
    const { data: seenByB } = await b.client.from("practice_sessions").select("id").eq("id", s.id);
    assert.deepEqual(seenByB, []);
  });

  test("translate_history: thêm, lưu, xoá mềm, hoàn tác của mình; người khác không đụng được", async () => {
    const { data: row, error } = await a.client.from("translate_history")
      .insert({ user_id: a.id, source_text: "hello", translated_text: "xin chào", direction: "EN→VI", is_saved: false })
      .select("id").single();
    assert.ok(!error, error?.message);

    const { data: hiddenByB } = await b.client.from("translate_history")
      .update({ deleted_at: new Date().toISOString() }).eq("id", row.id).select("id");
    assert.deepEqual(hiddenByB, []);

    for (const patch of [{ is_saved: true }, { deleted_at: new Date().toISOString() }, { deleted_at: null }]) {
      const { data } = await a.client.from("translate_history").update(patch).eq("id", row.id).eq("user_id", a.id).select("id");
      assert.equal(data.length, 1, JSON.stringify(patch));
    }
  });

  test("journal_entries: cập nhật lịch ôn của mình (learning/schedule)", async () => {
    const { data: j, error } = await a.client.from("journal_entries")
      .insert({ user_id: a.id, content: "note" }).select("id, review_count").single();
    assert.ok(!error, error?.message);
    const { data } = await a.client.from("journal_entries")
      .update({ review_count: 1, last_reviewed_at: new Date().toISOString() }).eq("id", j.id).eq("user_id", a.id).select("review_count");
    assert.deepEqual(data, [{ review_count: 1 }]);
    const { data: byB } = await b.client.from("journal_entries").update({ review_count: 9 }).eq("id", j.id).select("id");
    assert.deepEqual(byB, []);
  });

  test("profiles: đọc hồ sơ của mình, không đọc của người khác (email/test)", async () => {
    const { data: own } = await a.client.from("profiles").select("id").eq("id", a.id).maybeSingle();
    assert.equal(own?.id, a.id);
    const { data: other } = await a.client.from("profiles").select("id").eq("id", b.id);
    assert.deepEqual(other, []);
  });
});
