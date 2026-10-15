// Cô lập word_source_settings + widget_schedule (spec 2026-10-15 §7) và hàm
// cron sync_widget_schedule (chép lịch đã qua sang suggestion_log, dọn > 3 ngày).
// Chạy qua anon key + JWT thật — service role chỉ để dựng/kiểm dữ liệu.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers, adminClient } from "../helpers/supabase-test-client.mjs";

const skip = skipReason();
const iso = (ms) => new Date(ms).toISOString();

describe("Nguồn từ + lịch widget: RLS + hàm cron", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b, entryA, wordId;
  const admin = skip ? null : adminClient();

  before(async () => {
    a = await createTestUser("wsA");
    b = await createTestUser("wsB");
    const { data: e, error } = await admin.from("translate_history")
      .insert({ user_id: a.id, source_text: "resilient", translated_text: "kiên cường", direction: "EN→VI", is_saved: true })
      .select("id").single();
    assert.ok(!error, error?.message);
    entryA = e.id;
    const { data: w, error: wErr } = await admin.from("words")
      .insert({ word: `ws-test-${Date.now()}`, level: "B1", def_en: "test" }).select("id").single();
    assert.ok(!wErr, wErr?.message);
    wordId = w.id;
  });
  after(async () => {
    await cleanupUsers(a, b);
    if (wordId) await admin.from("words").delete().eq("id", wordId);
  });

  test("word_source_settings: chủ upsert + đọc được, người khác không đọc/ghi hộ", async () => {
    const own = await a.client.from("word_source_settings")
      .upsert({ user_id: a.id, include_saved: true, include_bank: false, pinned_ids: [entryA], pinned_only: true });
    assert.ok(!own.error, own.error?.message);
    const again = await a.client.from("word_source_settings").upsert({ user_id: a.id, include_saved: true, include_bank: true, pinned_ids: [], pinned_only: false });
    assert.ok(!again.error, again.error?.message);
    assert.equal((await a.client.from("word_source_settings").select("user_id")).data.length, 1);
    assert.deepEqual((await b.client.from("word_source_settings").select("user_id").eq("user_id", a.id)).data, []);
    assert.ok((await b.client.from("word_source_settings").insert({ user_id: a.id })).error, "không ghi hộ A");
    await b.client.from("word_source_settings").update({ include_bank: false }).eq("user_id", a.id);
    const { data } = await admin.from("word_source_settings").select("include_bank").eq("user_id", a.id).single();
    assert.equal(data.include_bank, true, "update của B không chạm dòng của A");
  });

  test("word_source_settings: DB chặn quá 30 ghim", async () => {
    const many = Array.from({ length: 31 }, () => crypto.randomUUID());
    assert.ok((await a.client.from("word_source_settings").upsert({ user_id: a.id, pinned_ids: many })).error);
  });

  test("widget_schedule: chủ ghi/đọc/xoá được, người khác không thấy, không xoá được", async () => {
    const t = Date.now() + 60 * 60 * 1000;
    const ins = await a.client.from("widget_schedule").insert([
      { user_id: a.id, shown_at: iso(t), entry_id: entryA },
      { user_id: a.id, shown_at: iso(t + 1), bank_word_id: wordId },
    ]);
    assert.ok(!ins.error, ins.error?.message);
    assert.equal((await a.client.from("widget_schedule").select("id")).data.length, 2);
    assert.deepEqual((await b.client.from("widget_schedule").select("id").eq("user_id", a.id)).data, []);
    assert.ok((await b.client.from("widget_schedule").insert({ user_id: a.id, shown_at: iso(t), entry_id: entryA })).error);
    await b.client.from("widget_schedule").delete().eq("user_id", a.id);
    assert.equal((await admin.from("widget_schedule").select("id").eq("user_id", a.id)).data.length, 2);
    const del = await a.client.from("widget_schedule").delete().eq("user_id", a.id);
    assert.ok(!del.error, del.error?.message);
    assert.equal((await admin.from("widget_schedule").select("id").eq("user_id", a.id)).data.length, 0);
  });

  test("widget_schedule: CHECK đúng một id", async () => {
    const t = iso(Date.now());
    assert.ok((await a.client.from("widget_schedule").insert({ user_id: a.id, shown_at: t })).error, "thiếu cả hai");
    assert.ok((await a.client.from("widget_schedule").insert({ user_id: a.id, shown_at: t, entry_id: entryA, bank_word_id: wordId })).error, "có cả hai");
  });

  test("sync_widget_schedule: người dùng không gọi được", async () => {
    assert.ok((await a.client.rpc("sync_widget_schedule", {})).error);
  });

  test("sync_widget_schedule: chép dòng đã qua sang suggestion_log đúng một lần, dọn dòng > 3 ngày", async () => {
    const now = Date.now();
    const H = 60 * 60 * 1000;
    const ins = await admin.from("widget_schedule").insert([
      { user_id: a.id, shown_at: iso(now - 2 * H), entry_id: entryA },
      { user_id: a.id, shown_at: iso(now - 1 * H), bank_word_id: wordId },
      { user_id: a.id, shown_at: iso(now + 1 * H), entry_id: entryA },       // tương lai → chưa chép
      { user_id: b.id, shown_at: iso(now - 4 * 24 * H), bank_word_id: wordId }, // > 3 ngày → dọn
    ]);
    assert.ok(!ins.error, ins.error?.message);

    const r1 = await admin.rpc("sync_widget_schedule", { p_now: iso(now) });
    assert.ok(!r1.error, r1.error?.message);
    const r2 = await admin.rpc("sync_widget_schedule", { p_now: iso(now) });
    assert.ok(!r2.error, r2.error?.message);
    assert.equal(r2.data.logged, 0, "lượt sau không chép lại");

    const { data: logs } = await admin.from("suggestion_log")
      .select("source, entry_type, entry_id, bank_word_id, shown_at").eq("user_id", a.id).eq("source", "widget");
    assert.equal(logs.length, 2);
    const th = logs.find((l) => l.entry_type === "translate_history");
    assert.equal(th.entry_id, entryA);
    assert.equal(Date.parse(th.shown_at), now - 2 * H, "giữ đúng giờ hiện");
    assert.equal(logs.find((l) => l.entry_type === "bank").bank_word_id, wordId);

    assert.equal((await admin.from("widget_schedule").select("id").eq("user_id", b.id)).data.length, 0, "dòng 4 ngày trước bị dọn");
    assert.equal((await admin.from("widget_schedule").select("id").eq("user_id", a.id)).data.length, 3, "dòng < 3 ngày giữ cho push");
    // Dòng của B (4 ngày trước, chưa chép) bị dọn mà không ghi log — quá cũ, không còn ý nghĩa
    assert.equal((await admin.from("suggestion_log").select("id").eq("user_id", b.id)).data.length, 0);
  });
});
