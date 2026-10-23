// Quảng cáo trong app (spec 2026-10-23-in-app-ads-design.md): lượt dịch miễn
// phí theo ngày + lượt thưởng tích luỹ (ad_credits), thưởng quảng cáo chỉ ghi
// qua service role (SSV), không cộng trùng một giao dịch, theme mở khoá cô lập
// theo người dùng. Chạy qua anon key + JWT thật — service role chỉ để cấp thưởng.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { skipReason, createTestUser, cleanupUsers, adminClient, guestClient } from "../helpers/supabase-test-client.mjs";

const skip = skipReason();

describe("Quảng cáo: RLS + hàm lượt dịch / thưởng", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b, c, d, e;
  const admin = skip ? null : adminClient();
  const tx = () => `tx-${randomUUID()}`;

  before(async () => {
    a = await createTestUser("adsA");
    b = await createTestUser("adsB");
    c = await createTestUser("adsC");
    d = await createTestUser("adsD");
    e = await createTestUser("adsE");
  });
  after(async () => {
    await cleanupUsers(a, b, c, d, e);
  });

  const consume = (u, free, key = null) => u.client.rpc("consume_translate", { p_daily_free: free, p_quota_key: key });
  const grant = (p) => admin.rpc("grant_ad_reward", {
    p_transaction_id: p.tx, p_user_id: p.user_id, p_kind: p.kind ?? "translate",
    p_theme_id: p.theme_id ?? null, p_credits: p.credits ?? 10,
  });

  test("consume_translate: hết lượt miễn phí thì chặn, có lượt thưởng thì trừ thưởng", async () => {
    const r1 = await consume(a, 2);
    assert.ok(!r1.error, r1.error?.message);
    assert.equal(r1.data.charged, "free");
    assert.equal((await consume(a, 2)).data.charged, "free");
    const blocked = (await consume(a, 2)).data;
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.credits, 0);

    const t = tx();
    assert.equal((await grant({ tx: t, user_id: a.id })).data, "applied");
    const paid = (await consume(a, 2)).data;
    assert.equal(paid.allowed, true);
    assert.equal(paid.charged, "credit");
    assert.equal(paid.credits, 9);

    // Cùng giao dịch SSV gửi lại → không cộng thêm
    assert.equal((await grant({ tx: t, user_id: a.id })).data, "duplicate");
    const today = (await a.client.rpc("translate_quota_today", {})).data;
    assert.equal(today.credits, 9);
    assert.equal(today.used, 2);
  });

  test("consume_translate: cùng quota_key không trừ lần hai", async () => {
    await consume(b, 0);
    assert.equal((await grant({ tx: tx(), user_id: b.id, credits: 3 })).data, "applied");
    const key = randomUUID();
    const first = (await consume(b, 0, key)).data;
    assert.equal(first.charged, "credit");
    assert.equal(first.credits, 2);
    const again = (await consume(b, 0, key)).data;
    assert.equal(again.allowed, true);
    assert.equal(again.charged, "none");
    assert.equal(again.credits, 2);
    assert.equal((await b.client.rpc("translate_quota_today", { p_quota_key: key })).data.key_active, true);
  });

  test("consume_translate: hết lượt thì key mới không được ghi lại", async () => {
    const key = randomUUID();
    assert.equal((await consume(d, 0, key)).data.allowed, false);
    assert.equal((await consume(d, 0, key)).data.allowed, false);
    assert.equal((await d.client.rpc("translate_quota_today", { p_quota_key: key })).data.key_active, false);
  });

  test("consume_translate đồng thời không trừ quá số thưởng (nguyên tử)", async () => {
    assert.equal((await grant({ tx: tx(), user_id: c.id, credits: 3 })).data, "applied");
    const rs = await Promise.all(Array.from({ length: 8 }, () => consume(c, 0)));
    const ok = rs.filter((r) => r.data?.allowed).length;
    assert.equal(ok, 3);
    const { data } = await admin.from("ad_credits").select("balance").eq("user_id", c.id).single();
    assert.equal(data.balance, 0);
  });

  test("bảng quảng cáo: không ghi thẳng được, không thấy của người khác", async () => {
    assert.equal((await grant({ tx: tx(), user_id: a.id, kind: "theme", theme_id: "aurora" })).data, "applied");
    assert.ok((await a.client.from("ad_credits").insert({ user_id: a.id, balance: 999 })).error);
    assert.ok((await a.client.from("theme_unlocks").insert({ user_id: a.id, theme_id: "x" })).error);
    assert.ok((await a.client.from("ad_rewards").insert({ transaction_id: tx(), user_id: a.id, kind: "translate" })).error);
    await a.client.from("ad_credits").update({ balance: 999 }).eq("user_id", a.id);
    assert.equal((await admin.from("ad_credits").select("balance").eq("user_id", a.id).single()).data.balance, 9);

    assert.equal((await a.client.from("theme_unlocks").select("theme_id")).data.length, 1);
    assert.ok((await a.client.from("ad_rewards").select("transaction_id")).data.length >= 2);
    for (const t of ["ad_credits", "ad_rewards", "theme_unlocks"]) {
      assert.deepEqual((await b.client.from(t).select("user_id").eq("user_id", a.id)).data, [], t);
    }
  });

  test("grant_ad_reward: người dùng / khách không gọi được", async () => {
    const args = { p_transaction_id: tx(), p_user_id: a.id, p_kind: "translate", p_theme_id: null, p_credits: 1000 };
    assert.ok((await a.client.rpc("grant_ad_reward", args)).error);
    assert.ok((await guestClient().rpc("grant_ad_reward", args)).error);
    assert.ok((await guestClient().rpc("consume_translate", { p_daily_free: 10 })).error);
  });

  test("grant_ad_fallback: tối đa 5 lần mỗi ngày, mỗi lần +1 lượt", async () => {
    const rs = [];
    for (let i = 0; i < 6; i++) rs.push((await d.client.rpc("grant_ad_fallback", {})).data);
    assert.deepEqual(rs.map((r) => r.granted), [true, true, true, true, true, false]);
    assert.equal(rs[5].credits, 5);
  });

  // Giữ lượt trước khi gọi AI → dịch lỗi thì hoàn (review cuối: chặn song song)
  const refund = (u, id) => u.client.rpc("refund_translate", { p_charge_id: id });

  test("refund_translate: hoàn đúng một lần lượt miễn phí, câu đó phải trừ lại", async () => {
    const key = randomUUID();
    const r = (await consume(e, 10, key)).data;
    assert.equal(r.charged, "free");
    assert.ok(r.charge_id);
    assert.equal((await refund(e, r.charge_id)).data, true);
    assert.equal((await refund(e, r.charge_id)).data, false, "không hoàn hai lần");
    const today = (await e.client.rpc("translate_quota_today", { p_quota_key: key })).data;
    assert.equal(today.used, 0);
    assert.equal(today.key_active, false);
  });

  test("refund_translate: hoàn lượt thưởng; người khác / khách không hoàn được", async () => {
    assert.equal((await grant({ tx: tx(), user_id: e.id, credits: 1 })).data, "applied");
    const r = (await consume(e, 0)).data;
    assert.equal(r.charged, "credit");
    assert.equal((await refund(b, r.charge_id)).data, false);
    assert.ok((await guestClient().rpc("refund_translate", { p_charge_id: r.charge_id })).error);
    assert.equal((await refund(e, r.charge_id)).data, true);
    assert.equal((await e.client.rpc("translate_quota_today", {})).data.credits, 1);
    assert.equal((await refund(e, randomUUID())).data, false, "id bịa → không cộng gì");
  });

});
