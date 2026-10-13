import test from "node:test";
import assert from "node:assert/strict";
import { pushLink, truncate, buildPushMessage } from "../../src/lib/push/build-message.js";

test("link từ đã lưu: id thô, bank=0", () => {
  assert.equal(pushLink({ id: "abc-1", word: "resilient", meaning: "kiên cường", fromBank: false }),
    "wordly://word?id=abc-1&w=resilient&m=ki%C3%AAn%20c%C6%B0%E1%BB%9Dng&bank=0");
});

test("link từ kho: id có tiền tố bank-, bank=1", () => {
  assert.match(pushLink({ id: 42, word: "go", meaning: "đi", fromBank: true }), /^wordly:\/\/word\?id=bank-42&w=go&m=.*&bank=1$/);
});

test("ký tự đặc biệt mã hoá %XX, không dùng + cho dấu cách (Review Focus #1)", () => {
  const link = pushLink({ id: "1", word: "make up", meaning: "a+b & c # d", fromBank: false });
  assert.ok(link.includes("w=make%20up"));
  assert.ok(link.includes("m=a%2Bb%20%26%20c%20%23%20d"));
  assert.ok(!link.includes("+"));
});

test("truncate theo ký tự (không cắt đôi emoji), thêm …", () => {
  assert.equal(truncate("ngắn"), "ngắn");
  const t = truncate("á".repeat(200));
  assert.equal(Array.from(t).length, 150);
  assert.ok(t.endsWith("…"));
  const e = truncate("😀".repeat(151));
  assert.ok(e.endsWith("…"));
  assert.ok(Array.from(e).slice(0, -1).every((c) => c === "😀"), "không còn nửa emoji");
});

test("message: title = từ, body = nghĩa, header APNs, data.link chuỗi", () => {
  const now = new Date("2026-10-13T13:00:00Z");
  const m = buildPushMessage({ token: "T", word: { id: "1", word: "resilient", meaning: "kiên cường", fromBank: false }, now });
  assert.equal(m.token, "T");
  assert.equal(m.apns.payload.aps.alert.title, "resilient");
  assert.equal(m.apns.payload.aps.alert.body, "kiên cường");
  assert.equal(m.apns.payload.aps.sound, "default");
  assert.equal(m.apns.payload.aps["thread-id"], "wordly-review");
  assert.equal(m.apns.headers["apns-push-type"], "alert");
  assert.equal(m.apns.headers["apns-priority"], "10");
  assert.equal(m.apns.headers["apns-expiration"], String(Math.floor(now.getTime() / 1000) + 3600));
  assert.equal(typeof m.data.link, "string");
  assert.equal(m.android, undefined);
});

test("nghĩa rỗng → body mặc định, vẫn có link", () => {
  const m = buildPushMessage({ token: "T", word: { id: "1", word: "x", meaning: "  ", fromBank: false }, now: new Date() });
  assert.equal(m.apns.payload.aps.alert.body, "Chạm để ôn lại từ này");
  assert.match(m.data.link, /^wordly:\/\/word\?id=1&w=x&m=&bank=0$/);
});
