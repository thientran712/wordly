// Wordly Pro (spec 2026-10-16 §4): cô lập entitlements / usage_daily /
// dictionary_lookups, hàm consume_quota + usage_today (trừ lượt nguyên tử,
// từ đã biết không tính), apply_entitlement (chỉ service role, không chuyển
// gói sang tài khoản khác), due_push_slots chỉ gửi khung sớm nhất khi miễn phí.
// Chạy qua anon key + JWT thật — service role chỉ để dựng/kiểm dữ liệu.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers, adminClient, guestClient } from "../helpers/supabase-test-client.mjs";

const skip = skipReason();
const DAY = 86_400_000;

describe("Wordly Pro: RLS + hàm hạn mức", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b, bankWord;
  const admin = skip ? null : adminClient();

  before(async () => {
    a = await createTestUser("proA");
    b = await createTestUser("proB");
    bankWord = `billing-bank-${Date.now()}`;
    const w = await admin.from("words").insert({ word: bankWord, level: "B1", def_en: "test" });
    assert.ok(!w.error, w.error?.message);
  });
  after(async () => {
    await cleanupUsers(a, b);
    await admin.from("words").delete().eq("word", bankWord);
  });

  const apply = (p) => admin.rpc("apply_entitlement", {
    p_user_id: p.user_id, p_source: "app_store", p_product_id: "wordly.pro.monthly",
    p_original_transaction_id: p.otid, p_expires_at: p.expires_at, p_in_grace: p.in_grace ?? false,
    p_grace_expires_at: p.grace_expires_at ?? null, p_auto_renew: p.auto_renew ?? true,
    p_environment: "Sandbox", p_event_at: p.event_at,
  });

  test("entitlements: người dùng không tự ghi được, chỉ đọc của mình", async () => {
    const own = await a.client.from("entitlements").insert({
      user_id: a.id, source: "gift", expires_at: new Date(Date.now() + DAY).toISOString(),
    });
    assert.ok(own.error, "RLS phải chặn INSERT");
    const r = await apply({ user_id: a.id, otid: `otid-a-${Date.now()}`, expires_at: new Date(Date.now() + DAY).toISOString(), event_at: new Date().toISOString() });
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.data, "applied");
    assert.equal((await a.client.from("entitlements").select("user_id")).data.length, 1);
    assert.deepEqual((await b.client.from("entitlements").select("user_id").eq("user_id", a.id)).data, []);
    await a.client.from("entitlements").update({ expires_at: "2099-01-01T00:00:00Z" }).eq("user_id", a.id);
    const { data } = await admin.from("entitlements").select("expires_at").eq("user_id", a.id).single();
    assert.ok(new Date(data.expires_at).getFullYear() < 2099, "UPDATE của người dùng không có tác dụng");
    await a.client.from("entitlements").delete().eq("user_id", a.id);
    assert.equal((await admin.from("entitlements").select("user_id").eq("user_id", a.id)).data.length, 1);
  });

  test("apply_entitlement: người dùng thường không gọi được", async () => {
    const r = await a.client.rpc("apply_entitlement", {
      p_user_id: a.id, p_source: "gift", p_product_id: null, p_original_transaction_id: null,
      p_expires_at: null, p_in_grace: false, p_grace_expires_at: null, p_auto_renew: null,
      p_environment: null, p_event_at: new Date().toISOString(),
    });
    assert.ok(r.error);
  });

  test("apply_entitlement: sự kiện cũ hơn bị bỏ qua, gói của người khác không bị chuyển", async () => {
    const otid = `otid-move-${Date.now()}`;
    const t0 = Date.now();
    assert.equal((await apply({ user_id: b.id, otid, expires_at: new Date(t0 + DAY).toISOString(), event_at: new Date(t0).toISOString() })).data, "applied");
    const stale = await apply({ user_id: b.id, otid, expires_at: new Date(t0 - DAY).toISOString(), event_at: new Date(t0 - 1000).toISOString() });
    assert.equal(stale.data, "stale");
    const { data: rowB } = await admin.from("entitlements").select("expires_at").eq("user_id", b.id).single();
    assert.equal(new Date(rowB.expires_at).getTime(), t0 + DAY);
    // Cùng original_transaction_id nhưng user khác → không ghi, không nhân đôi
    const moved = await apply({ user_id: a.id, otid, expires_at: new Date(t0 + 2 * DAY).toISOString(), event_at: new Date(t0 + 5000).toISOString() });
    assert.equal(moved.data, "other_account");
    assert.equal((await admin.from("entitlements").select("user_id").eq("original_transaction_id", otid)).data[0].user_id, b.id);
  });

  test("usage_daily / dictionary_lookups: không ghi thẳng được, không thấy của người khác", async () => {
    const day = new Date().toISOString().slice(0, 10);
    assert.ok((await a.client.from("usage_daily").insert({ user_id: a.id, day, kind: "dictionary", count: 0 })).error);
    assert.ok((await a.client.from("dictionary_lookups").insert({ user_id: a.id, word_key: "x" })).error);
    await admin.from("usage_daily").insert({ user_id: b.id, day, kind: "dictionary", count: 3 });
    assert.deepEqual((await a.client.from("usage_daily").select("count").eq("user_id", b.id)).data, []);
  });

  test("consume_quota: khách không gọi được, kind lạ bị từ chối", async () => {
    assert.ok((await guestClient().rpc("consume_quota", { p_kind: "dictionary", p_limit: 5 })).error);
    assert.ok((await a.client.rpc("consume_quota", { p_kind: "hack", p_limit: 5 })).error);
  });

  test("consume_quota advanced_translate: trừ đúng tới giới hạn rồi chặn", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      const { data, error } = await a.client.rpc("consume_quota", { p_kind: "advanced_translate", p_limit: 3 });
      assert.ok(!error, error?.message);
      results.push(data);
    }
    assert.deepEqual(results.map((r) => r.allowed), [true, true, true, false]);
    assert.deepEqual(results.map((r) => r.used), [1, 2, 3, 3]);
    assert.deepEqual(results.map((r) => r.remaining), [2, 1, 0, 0]);
    const { data: u } = await a.client.rpc("usage_today", {});
    assert.equal(u.advanced_translate, 3);
    assert.equal(u.dictionary, 0);
  });

  test("consume_quota đồng thời không vượt giới hạn (nguyên tử)", async () => {
    const all = await Promise.all(Array.from({ length: 8 }, () =>
      b.client.rpc("consume_quota", { p_kind: "advanced_translate", p_limit: 5 })));
    assert.equal(all.filter((r) => r.data?.allowed).length, 5);
  });

  test("consume_quota dictionary: từ mới tính lượt, tra lại / từ đã lưu / kho từ / đã gợi ý không tính", async () => {
    const { data: saved } = await admin.from("translate_history")
      .insert({ user_id: a.id, source_text: "Resilient", translated_text: "kiên cường", direction: "EN→VI", is_saved: true })
      .select("id").single();
    const { data: shown } = await admin.from("translate_history")
      .insert({ user_id: a.id, source_text: "ephemeral", translated_text: "phù du", direction: "EN→VI", is_saved: false })
      .select("id").single();
    await admin.from("suggestion_log").insert({ user_id: a.id, source: "widget", entry_type: "translate_history", entry_id: shown.id });
    assert.ok(saved.id);

    const c = (w) => a.client.rpc("consume_quota", { p_kind: "dictionary", p_limit: 2, p_word_key: w });
    const r1 = (await c("serendipity")).data;
    assert.deepEqual([r1.allowed, r1.used, r1.free], [true, 1, false]);
    const again = (await c("serendipity")).data;
    assert.deepEqual([again.allowed, again.used, again.free], [true, 1, true], "tra lại không tính");
    for (const w of ["resilient", bankWord, "ephemeral"]) {
      const r = (await c(w)).data;
      assert.deepEqual([r.allowed, r.free], [true, true], w);
    }
    assert.equal((await c("ubiquitous")).data.used, 2);
    const blocked = (await c("quintessential")).data;
    assert.deepEqual([blocked.allowed, blocked.used, blocked.remaining], [false, 2, 0]);
    const { data: known } = await a.client.rpc("usage_today", { p_word_key: "serendipity" });
    assert.equal(known.known_word, true);
    assert.equal((await a.client.rpc("usage_today", { p_word_key: "quintessential" })).data.known_word, false);
    // B không thấy từ A đã tra, và từ của A không miễn phí cho B
    assert.deepEqual((await b.client.from("dictionary_lookups").select("word_key").eq("user_id", a.id)).data, []);
    assert.equal((await b.client.rpc("usage_today", { p_word_key: "serendipity" })).data.known_word, false);
    assert.equal((await b.client.rpc("usage_today", { p_word_key: "resilient" })).data.known_word, false);
  });

  test("consume_quota: từ đã lưu nhưng đã xoá mềm thì không còn miễn phí", async () => {
    await admin.from("translate_history").insert({ user_id: b.id, source_text: "gone", translated_text: "đi", direction: "EN→VI", is_saved: true, deleted_at: new Date().toISOString() });
    assert.equal((await b.client.rpc("usage_today", { p_word_key: "gone" })).data.known_word, false);
  });

  test("due_push_slots(p_free_one_slot): miễn phí chỉ khung sớm nhất, Pro gửi đủ", async () => {
    const u = await createTestUser("proPush");
    try {
      await admin.from("profiles").update({ timezone: "Asia/Ho_Chi_Minh" }).eq("id", u.id);
      await admin.from("push_preferences").upsert({ user_id: u.id, enabled: true });
      await u.client.rpc("register_push_device", { p_token: "p".repeat(140), p_platform: "ios", p_app_version: null });
      // 07:00 bị tắt → khung sớm nhất ĐANG BẬT là 08:00
      const ins = await admin.from("push_slots").insert([
        { user_id: u.id, send_time: "07:00", enabled: false },
        { user_id: u.id, send_time: "08:00", enabled: true },
        { user_id: u.id, send_time: "20:00", enabled: true },
      ]);
      assert.ok(!ins.error, ins.error?.message);
      const due = async (iso, free) => {
        const { data, error } = await admin.rpc("due_push_slots", { p_now: iso, p_catchup_minutes: 30, p_free_one_slot: free });
        assert.ok(!error, error?.message);
        return data.filter((d) => d.user_id === u.id).length;
      };
      // 08:05 và 20:05 giờ VN
      assert.equal(await due("2026-10-14T01:05:00Z", true), 1);
      assert.equal(await due("2026-10-14T13:05:00Z", true), 0, "khung thứ 2 không gửi khi miễn phí");
      assert.equal(await due("2026-10-14T13:05:00Z", false), 1, "tắt chặn → như cũ");
      const { data: twoArgs } = await admin.rpc("due_push_slots", { p_now: "2026-10-14T13:05:00Z", p_catchup_minutes: 30 });
      assert.equal(twoArgs.filter((d) => d.user_id === u.id).length, 1, "gọi kiểu cũ (2 tham số) vẫn chạy như cũ");
      await apply({ user_id: u.id, otid: `otid-push-${Date.now()}`, expires_at: new Date("2026-10-20T00:00:00Z").toISOString(), event_at: new Date().toISOString() });
      assert.equal(await due("2026-10-14T13:05:00Z", true), 1, "Pro → gửi đủ khung");
      // Ân hạn: hết hạn nhưng còn ân hạn → vẫn Pro
      await admin.from("entitlements").update({ expires_at: "2026-10-13T00:00:00Z", in_grace: true, grace_expires_at: "2026-10-20T00:00:00Z" }).eq("user_id", u.id);
      assert.equal(await due("2026-10-14T13:05:00Z", true), 1, "đang ân hạn vẫn là Pro");
      await admin.from("entitlements").update({ in_grace: false }).eq("user_id", u.id);
      assert.equal(await due("2026-10-14T13:05:00Z", true), 0, "hết hạn → về miễn phí");
    } finally {
      await cleanupUsers(u);
    }
  });
});
