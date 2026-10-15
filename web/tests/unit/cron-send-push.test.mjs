import test from "node:test";
import assert from "node:assert/strict";
import { runDuePushSends } from "../../src/lib/push/cron-send-push.js";

// Supabase giả đủ dùng cho cron: from(t).select/eq/gte/insert/update/delete + rpc.
function fakeDb({ due = [], devices = [], pushLog = [], maxRows = Infinity, rpcSeesLog = true } = {}) {
  const db = { push_devices: [...devices], push_log: [...pushLog], suggestion_log: [] };
  const rpcCalls = [];
  const filtersMatch = (row, filters) => filters.every(([c, v]) => row[c] === v);
  function from(table) {
    const filters = [];
    let op = "select", payload = null;
    const q = {
      select: () => q,
      gte: () => q,
      eq(c, v) { filters.push([c, v]); return q; },
      insert(row) { op = "insert"; payload = row; return q; },
      update(row) { op = "update"; payload = row; return q; },
      delete() { op = "delete"; return q; },
      then(resolve) {
        const rows = db[table] || (db[table] = []);
        let result = { data: null, error: null };
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          if (table === "push_log" && list.some((r) => rows.some((x) => x.slot_id === r.slot_id && x.send_date === r.send_date))) {
            result = { data: null, error: { code: "23505", message: "duplicate key" } };
          } else rows.push(...list);
        } else if (op === "update") {
          rows.filter((r) => filtersMatch(r, filters)).forEach((r) => Object.assign(r, payload));
        } else if (op === "delete") {
          db[table] = rows.filter((r) => !filtersMatch(r, filters));
        } else {
          result = { data: rows.filter((r) => filtersMatch(r, filters)), error: null };
        }
        return Promise.resolve(result).then(resolve);
      },
    };
    return q;
  }
  return {
    db, rpcCalls, from,
    rpc(name, args) {
      rpcCalls.push([name, args]);
      // Như hàm SQL: bỏ slot đã có push_log hôm đó; PostgREST cắt ở max_rows
      if (name === "due_push_slots") {
        const open = due.filter((d) => !rpcSeesLog || !db.push_log.some((l) => l.slot_id === d.slot_id && l.send_date === d.send_date));
        return Promise.resolve({ data: open.slice(0, maxRows), error: null });
      }
      if (name === "cleanup_push_data") return Promise.resolve({ data: { logs: 0, devices: 0 }, error: null });
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    },
  };
}

const config = { projectId: "p", serviceAccount: {} };
const tokenProvider = () => { let n = 0; return { get: async () => `AT${n}`, invalidate: () => { n++; } }; };
const ownWord = async () => ({ id: "w1", word: "resilient", meaning: "kiên cường", fromBank: false, step: 2 });
const noWord = async () => null;
const bankWord = async () => ({ id: 7, word: "go", meaning: "đi", fromBank: true, step: 5 });
const okSend = () => { const sent = []; const fn = async (a) => { sent.push(a); return { ok: true, status: 200, code: null }; }; fn.sent = sent; return fn; };
const slot = (i, user = `u${i}`) => ({ slot_id: `s${i}`, user_id: user, send_date: "2026-10-13" });
const now = new Date("2026-10-13T13:00:00Z");

test("thiếu cấu hình FCM → disabled, không gọi DB", async () => {
  const sb = fakeDb();
  assert.deepEqual(await runDuePushSends(sb, now, { config: null }), { disabled: true });
  assert.equal(sb.rpcCalls.length, 0);
});

test("gửi tới mọi thiết bị, log sent + suggestion_log source=push", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }, { id: "d2", user_id: "u1", token: "T2" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord });
  assert.equal(r.sent, 1);
  assert.deepEqual(send.sent.map((s) => s.message.token), ["T1", "T2"]);
  assert.equal(sb.db.push_log[0].status, "sent");
  assert.equal(sb.db.push_log[0].devices, 2);
  assert.deepEqual(sb.db.suggestion_log, [{ user_id: "u1", source: "push", entry_type: "translate_history", entry_id: "w1" }]);
  assert.deepEqual(sb.rpcCalls[0], ["due_push_slots", { p_now: now.toISOString(), p_catchup_minutes: 30 }]);
  assert.equal(sb.rpcCalls.at(-1)[0], "cleanup_push_data");
});

test("chọn từ qua selectPushWord(supabase, userId, now, { selectBank }) — đúng người, đúng giờ", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  let seen = null;
  const selectBank = async () => [];
  await runDuePushSends(sb, now, {
    config, tokenProvider: tokenProvider(), send: okSend(), selectBank,
    selectWord: async (client, userId, at, deps) => { seen = { client, userId, at, deps }; return null; },
  });
  assert.equal(seen.client, sb);
  assert.equal(seen.userId, "u1");
  assert.equal(seen.at, now);
  assert.equal(seen.deps.selectBank, selectBank);
});

test("hết từ riêng → dùng từ kho, link bank", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: bankWord });
  assert.match(send.sent[0].message.data.link, /id=bank-7/);
  assert.deepEqual(sb.db.suggestion_log[0], { user_id: "u1", source: "push", entry_type: "bank", bank_word_id: 7 });
});

test("hết cả từ riêng lẫn kho → skipped, không gửi", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: noWord });
  assert.equal(r.skipped, 1);
  assert.equal(send.sent.length, 0);
  assert.equal(sb.db.push_log[0].status, "skipped");
});

test("slot đã có lượt khác giành (unique) → bỏ, không gửi trùng", async () => {
  // Lượt khác ghi log SAU khi due_push_slots của lượt này đã trả về (tranh chấp thật)
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }], pushLog: [{ slot_id: "s1", send_date: "2026-10-13", status: "sending" }], rpcSeesLog: false });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord });
  assert.equal(r.claimed_elsewhere, 1);
  assert.equal(send.sent.length, 0);
});

test("hai lượt cron chạy song song chỉ gửi một lần", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  const deps = { config, tokenProvider: tokenProvider(), send, selectWord: ownWord };
  await Promise.all([runDuePushSends(sb, now, deps), runDuePushSends(sb, now, deps)]);
  assert.equal(send.sent.length, 1);
});

test("chỉ gửi tới thiết bị CỦA người có slot (token đã chuyển chủ thì thôi) — Review Focus #5", async () => {
  const sb = fakeDb({ due: [slot(1, "uA")], devices: [{ id: "d1", user_id: "uB", token: "T-shared" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord });
  assert.equal(send.sent.length, 0);
  assert.equal(r.skipped, 1);
});

test("token chết bị xoá; INVALID_ARGUMENT do payload thì giữ", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }, { id: "d2", user_id: "u1", token: "T2" }] });
  const send = async ({ message }) => message.token === "T1"
    ? { ok: false, status: 404, code: "UNREGISTERED", message: "" }
    : { ok: false, status: 400, code: "INVALID_ARGUMENT", message: "Invalid value at 'message.apns'" };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord });
  assert.equal(r.tokens_removed, 1);
  assert.deepEqual(sb.db.push_devices.map((d) => d.id), ["d2"]);
  assert.equal(sb.db.push_log[0].status, "failed");
});

test("401 → làm mới access token, thử lại 1 lần", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const tokens = [];
  const send = async ({ accessToken }) => { tokens.push(accessToken); return tokens.length === 1 ? { ok: false, status: 401, code: "UNAUTHENTICATED" } : { ok: true, status: 200 }; };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord });
  assert.deepEqual(tokens, ["AT0", "AT1"]);
  assert.equal(r.sent, 1);
});

test("lỗi cấu hình (THIRD_PARTY_AUTH_ERROR) → dừng lượt, slot sau để lượt sau", async () => {
  const due = [slot(1), slot(2), slot(3)];
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices });
  const send = async () => ({ ok: false, status: 401, code: "THIRD_PARTY_AUTH_ERROR" });
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord, concurrency: 1 });
  assert.equal(r.fatal, "THIRD_PARTY_AUTH_ERROR");
  assert.equal(r.deferred, 2);
  assert.equal(sb.db.push_log.length, 1, "slot chưa giành quyền thì chưa có log → lượt sau gửi bù");
});

test("due_push_slots lỗi → throw (route ghi lỗi, email vẫn chạy)", async () => {
  const sb = fakeDb();
  sb.rpc = async () => ({ data: null, error: { message: "boom" } });
  await assert.rejects(() => runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send: okSend() }), /due_push_slots: boom/);
});

test("PostgREST cắt 1000 dòng/lần → gọi lại theo lô tới khi hết (10k người cùng 20:00)", async () => {
  const due = Array.from({ length: 2500 }, (_, i) => slot(i));
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices, maxRows: 1000 });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectWord: ownWord, concurrency: 50 });
  assert.equal(r.sent, 2500);
  assert.equal(r.due, 2500);
  assert.equal(send.sent.length, 2500);
  assert.equal(sb.rpcCalls.filter(([n]) => n === "due_push_slots").length, 4, "3 lô có dữ liệu + 1 lô rỗng");
});

test("lô không tiến được (claim lỗi liên tục) → dừng, không lặp vô hạn", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const from = sb.from;
  sb.from = (t) => {
    const q = from(t);
    if (t !== "push_log") return q;
    q.insert = () => ({ then: (res) => Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } }).then(res) });
    return q;
  };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send: okSend(), selectWord: ownWord });
  assert.equal(r.failed, 1);
  assert.equal(sb.rpcCalls.filter(([n]) => n === "due_push_slots").length, 1);
});

test("hết thời gian giữa các lô → budget_exhausted = true (log thấy được quá tải)", async () => {
  const due = Array.from({ length: 30 }, (_, i) => slot(i));
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices, maxRows: 10 });
  const slowSend = async () => { await new Promise((r) => setTimeout(r, 30)); return { ok: true, status: 200 }; };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send: slowSend, selectWord: ownWord, concurrency: 10, budgetMs: 20 });
  assert.equal(r.budget_exhausted, true);
  assert.ok(r.sent < 30);
  const ok = await runDuePushSends(fakeDb({ due: [slot(1)], devices: [{ id: "d", user_id: "u1", token: "T" }] }), now, { config, tokenProvider: tokenProvider(), send: okSend(), selectWord: ownWord });
  assert.equal(ok.budget_exhausted, false);
});

test("không lấy được access token Google → dừng lượt, không giành slot nào (review #2)", async () => {
  const due = [slot(1), slot(2), slot(3)];
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices });
  const send = okSend();
  const broken = { get: async () => { throw new Error("google token: 400 invalid_grant"); }, invalidate() {} };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: broken, send, selectWord: ownWord });
  assert.equal(r.fatal, "TOKEN");
  assert.match(r.errors[0], /invalid_grant/);
  assert.equal(sb.db.push_log.length, 0, "chưa giành slot nào → lượt sau gửi bù được");
  assert.equal(send.sent.length, 0);
});

test("access token hỏng giữa lượt (sau khi đã giành slot) → fatal, dừng nhận slot mới", async () => {
  const due = [slot(1), slot(2), slot(3)];
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices });
  let calls = 0;
  const flaky = { get: async () => { calls++; if (calls > 1) throw new Error("network"); return "AT"; }, invalidate() {} };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: flaky, send: okSend(), selectWord: ownWord, concurrency: 1 });
  assert.equal(r.fatal, "TOKEN");
  assert.equal(sb.db.push_log.length, 1, "chỉ slot đang gửi bị mất, hai slot sau để lượt sau");
  assert.equal(sb.db.push_log[0].status, "failed");
});
