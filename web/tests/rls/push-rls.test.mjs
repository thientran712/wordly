// Cô lập dữ liệu push giữa người dùng + hàm SQL due_push_slots khớp bản JS.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers, adminClient } from "../helpers/supabase-test-client.mjs";
import { duePushSlotsModel } from "../../src/lib/push/due-push-slots-model.js";

const skip = skipReason();
const token = (c) => `${c}`.repeat(140); // 140 ký tự hợp lệ

describe("Push: RLS + hàm SQL", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b;
  const admin = skip ? null : adminClient();
  before(async () => { a = await createTestUser("pushA"); b = await createTestUser("pushB"); });
  after(() => cleanupUsers(a, b));

  test("không INSERT thẳng push_devices được (chỉ qua RPC)", async () => {
    const { error } = await a.client.from("push_devices").insert({ user_id: a.id, token: token("a") });
    assert.ok(error, "RLS phải chặn");
  });

  test("register_push_device: token sai định dạng bị từ chối", async () => {
    const { error } = await a.client.rpc("register_push_device", { p_token: "ngan", p_platform: "ios", p_app_version: "1.0" });
    assert.ok(error);
  });

  test("B đăng ký token của A → token chuyển sang B, A không còn (Review Focus #5)", async () => {
    const t = token("x");
    const ra = await a.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: "1.0 (16)" });
    assert.ok(!ra.error, ra.error?.message);
    const rb = await b.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: "1.0 (16)" });
    assert.ok(!rb.error, rb.error?.message);
    const { data: rows } = await admin.from("push_devices").select("user_id").eq("token", t);
    assert.deepEqual(rows.map((r) => r.user_id), [b.id]);
    const { data: seenByA } = await a.client.from("push_devices").select("id");
    assert.deepEqual(seenByA, []);
  });

  test("B không đọc/xoá được thiết bị của A", async () => {
    const t = token("y");
    await a.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: null });
    const { data: seen } = await b.client.from("push_devices").select("id").eq("token", t);
    assert.deepEqual(seen, []);
    await b.client.from("push_devices").delete().eq("token", t);
    const { data: still } = await admin.from("push_devices").select("id").eq("token", t);
    assert.equal(still.length, 1);
  });

  test("push_preferences / push_slots: của ai nấy thấy, không ghi hộ", async () => {
    const own = await a.client.from("push_preferences").upsert({ user_id: a.id, enabled: true });
    assert.ok(!own.error, own.error?.message);
    assert.ok((await b.client.from("push_preferences").upsert({ user_id: a.id, enabled: false })).error);
    const slot = await a.client.from("push_slots").insert({ user_id: a.id, send_time: "20:00" });
    assert.ok(!slot.error, slot.error?.message);
    assert.ok((await b.client.from("push_slots").insert({ user_id: a.id, send_time: "21:00" })).error);
    assert.deepEqual((await b.client.from("push_slots").select("id").eq("user_id", a.id)).data, []);
  });

  test("push_slots: DB từ chối giờ lẻ và giờ trùng", async () => {
    assert.ok((await a.client.from("push_slots").insert({ user_id: a.id, send_time: "08:15" })).error);
    assert.ok((await a.client.from("push_slots").insert({ user_id: a.id, send_time: "20:00" })).error, "trùng 20:00");
  });

  test("push_log: người dùng không đọc được, không gọi được hàm cron", async () => {
    assert.deepEqual((await a.client.from("push_log").select("id")).data, []);
    assert.ok((await a.client.rpc("due_push_slots", {})).error);
    assert.ok((await a.client.rpc("cleanup_push_data", {})).error);
  });

  test("due_push_slots (SQL) khớp duePushSlotsModel (JS) — gồm ca qua nửa đêm", async () => {
    await admin.from("profiles").update({ timezone: "Asia/Ho_Chi_Minh" }).eq("id", a.id);
    const ins = await admin.from("push_slots").insert({ user_id: a.id, send_time: "23:30" });
    assert.ok(!ins.error, ins.error?.message);
    await admin.from("push_devices").delete().eq("user_id", a.id);
    await a.client.rpc("register_push_device", { p_token: token("z"), p_platform: "ios", p_app_version: null });
    const cases = [
      ["2026-10-13T13:00:00Z", 30], ["2026-10-13T13:29:00Z", 30], ["2026-10-13T13:30:00Z", 30],
      ["2026-10-13T16:59:00Z", 30], ["2026-10-13T17:05:00Z", 30], ["2026-10-13T17:05:00Z", 60],
    ];
    let nonEmpty = 0;
    for (const [iso, catchup] of cases) {
      const { data: sql, error } = await admin.rpc("due_push_slots", { p_now: iso, p_catchup_minutes: catchup });
      assert.ok(!error, error?.message);
      const [slots, preferences, profiles, devices, logs] = await Promise.all([
        admin.from("push_slots").select("id, user_id, send_time, enabled").eq("user_id", a.id),
        admin.from("push_preferences").select("user_id, enabled, frequency, custom_days").eq("user_id", a.id),
        admin.from("profiles").select("id, timezone").eq("id", a.id),
        admin.from("push_devices").select("user_id").eq("user_id", a.id),
        admin.from("push_log").select("slot_id, send_date").eq("user_id", a.id),
      ]);
      const js = duePushSlotsModel({ slots: slots.data, preferences: preferences.data, profiles: profiles.data,
        devices: devices.data, logs: logs.data, now: new Date(iso), catchupMinutes: catchup });
      const mine = sql.filter((r) => r.user_id === a.id);
      const key = (r) => `${r.slot_id}|${r.send_date}`;
      assert.deepEqual(mine.map(key).sort(), js.map(key).sort(), `${iso} cửa sổ ${catchup}`);
      nonEmpty += js.length ? 1 : 0;
    }
    assert.ok(nonEmpty >= 3, "phải có ca tới giờ thật, không chỉ so hai mảng rỗng");
  });

  test("push_log unique (slot_id, send_date) chặn giành quyền lần 2", async () => {
    const { data: slot } = await admin.from("push_slots").select("id").eq("user_id", a.id).limit(1).single();
    const row = { user_id: a.id, slot_id: slot.id, send_date: "2026-10-13", status: "sending" };
    const first = await admin.from("push_log").insert(row);
    assert.ok(!first.error, first.error?.message);
    const dup = await admin.from("push_log").insert(row);
    assert.equal(dup.error?.code, "23505");
  });

  test("suggestion_log nhận source = push", async () => {
    const { data: w } = await admin.from("words").select("id").limit(1).maybeSingle();
    if (!w) return; // DB local không có kho từ — bỏ qua phần này
    const r = await admin.from("suggestion_log").insert({ user_id: a.id, source: "push", entry_type: "bank", bank_word_id: w.id });
    assert.ok(!r.error, r.error?.message);
  });

  test("xoá user → dữ liệu push sạch (cascade)", async () => {
    const c = await createTestUser("pushC");
    await c.client.rpc("register_push_device", { p_token: token("c"), p_platform: "ios", p_app_version: null });
    await c.client.from("push_preferences").upsert({ user_id: c.id, enabled: true });
    await c.client.from("push_slots").insert({ user_id: c.id, send_time: "07:00" });
    const del = await admin.auth.admin.deleteUser(c.id);
    assert.ok(!del.error, del.error?.message);
    for (const t of ["push_devices", "push_preferences", "push_slots"]) {
      const { data } = await admin.from(t).select("user_id").eq("user_id", c.id);
      assert.deepEqual(data, [], t);
    }
  });
});
