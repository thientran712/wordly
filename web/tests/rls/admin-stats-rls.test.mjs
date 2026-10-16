// Thống kê chủ dự án (spec 2026-10-16-admin-stats-design.md): app_activity_daily
// chỉ ghi qua touch_activity (của chính mình), không ai đọc thẳng được;
// admin_stats / server_status chỉ service role.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers, adminClient, guestClient } from "../helpers/supabase-test-client.mjs";

const skip = skipReason();

describe("Thống kê: RLS + touch_activity + admin_stats", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b;
  const admin = skip ? null : adminClient();

  before(async () => {
    a = await createTestUser("statsA");
    b = await createTestUser("statsB");
  });
  after(async () => cleanupUsers(a, b));

  test("touch_activity ghi ngày hôm nay cho chính người gọi, gọi lại không thêm dòng", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await a.client.rpc("touch_activity", { p_build: 22 });
      assert.ok(!r.error, r.error?.message);
    }
    const { data } = await admin.from("app_activity_daily").select("user_id, build").eq("user_id", a.id);
    assert.equal(data.length, 1, "một dòng mỗi người mỗi ngày");
    assert.equal(data[0].build, 22);
    // build mới hơn trong ngày → ghi build mới; null (bản cũ) không xoá build đã biết
    await a.client.rpc("touch_activity", { p_build: 23 });
    await a.client.rpc("touch_activity", { p_build: null });
    const again = await admin.from("app_activity_daily").select("build").eq("user_id", a.id).single();
    assert.equal(again.data.build, 23);
  });

  test("app_activity_daily: người dùng không đọc/ghi/sửa thẳng, khách không gọi được", async () => {
    await b.client.rpc("touch_activity", { p_build: 22 });
    assert.deepEqual((await a.client.from("app_activity_daily").select("user_id")).data ?? [], [], "không thấy cả dòng của mình");
    const ins = await a.client.from("app_activity_daily").insert({ user_id: b.id, day: "2026-01-01", build: 1 });
    assert.ok(ins.error, "RLS chặn ghi thẳng (kể cả giả người khác)");
    const g = await guestClient().rpc("touch_activity", { p_build: 22 });
    assert.ok(g.error, "khách không gọi được");
  });

  test("admin_stats / server_status: chỉ service role", async () => {
    assert.ok((await a.client.rpc("admin_stats", {})).error, "người dùng không xem được thống kê");
    assert.deepEqual((await a.client.from("server_status").select("*")).data ?? [], [], "người dùng không đọc được tình trạng server");
    const w = await a.client.from("server_status").upsert({ id: 1, disk_pct: 1, mem_mb: 1, problems: [] });
    assert.ok(w.error, "người dùng không ghi được tình trạng server");

    const up = await admin.from("server_status").upsert({ id: 1, disk_pct: 35, mem_mb: 1800, problems: ["thử"], checked_at: new Date().toISOString() });
    assert.ok(!up.error, up.error?.message);
    const r = await admin.rpc("admin_stats", {});
    assert.ok(!r.error, r.error?.message);
    const s = r.data;
    for (const k of ["users", "retention", "series", "features", "limits_yesterday", "pro", "builds", "server"]) assert.ok(k in s, `thiếu ${k}`);
    assert.ok(s.users.total >= 2);
    assert.ok(s.users.mau >= 2, "a và b vừa hoạt động");
    assert.equal(s.series.length, 14);
    assert.equal(s.server.disk_pct, 35);
    assert.deepEqual(s.server.problems, ["thử"]);
    assert.ok(s.builds.some((x) => x.build === 23 || x.build === 22));
  });

  test("admin_stats: DAU tính ngày hôm qua (giờ VN) — báo cáo sáng là số của hôm qua", async () => {
    const yesterday = new Date(Date.now() + 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
    await admin.from("app_activity_daily").upsert({ user_id: a.id, day: yesterday, build: 22, first_at: new Date().toISOString(), last_at: new Date().toISOString() });
    const s = (await admin.rpc("admin_stats", {})).data;
    assert.ok(s.users.dau >= 1);
  });

  test("admin_stats_today: số trong ngày (giờ VN), chỉ service role", async () => {
    assert.ok((await a.client.rpc("admin_stats_today", {})).error, "người dùng không gọi được");
    await a.client.rpc("touch_activity", { p_build: 22 });
    const r = await admin.rpc("admin_stats_today", {});
    assert.ok(!r.error, r.error?.message);
    for (const k of ["new_users", "active", "saved", "quiz", "push_sent", "advanced_used", "dictionary_used"]) assert.equal(typeof r.data[k], "number", k);
    assert.ok(r.data.active >= 1, "a vừa mở app hôm nay");
    assert.ok(r.data.new_users >= 2, "a, b tạo hôm nay");
  });

  test("xoá user → dữ liệu hoạt động sạch (cascade)", async () => {
    const c = await createTestUser("statsC");
    await c.client.rpc("touch_activity", { p_build: 22 });
    await cleanupUsers(c);
    assert.deepEqual((await admin.from("app_activity_daily").select("user_id").eq("user_id", c.id)).data, []);
  });
});
