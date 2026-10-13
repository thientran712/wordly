import test from "node:test";
import assert from "node:assert/strict";
import { pushLink, buildPushMessage } from "../../src/lib/push/build-message.js";
import { truncate } from "../../src/lib/push/text.js";
import { pushCopy } from "../../src/lib/push/copy.js";

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
  assert.equal(truncate("ngắn", 150), "ngắn");
  const t = truncate("á".repeat(200), 150);
  assert.equal(Array.from(t).length, 150);
  assert.ok(t.endsWith("…"));
  const e = truncate("😀".repeat(151), 150);
  assert.ok(e.endsWith("…"));
  assert.ok(Array.from(e).slice(0, -1).every((c) => c === "😀"), "không còn nửa emoji");
});

test("message: tiêu đề/nội dung giọng lầy (có từ + nghĩa), header APNs, data.link chuỗi", () => {
  const now = new Date("2026-10-13T13:00:00Z");
  const word = { id: "1", word: "resilient", meaning: "kiên cường", fromBank: false };
  const m = buildPushMessage({ token: "T", word, now, seed: "slot-1" });
  assert.equal(m.token, "T");
  const expected = pushCopy({ ...word, seed: "slot-1", now });
  assert.equal(m.apns.payload.aps.alert.title, expected.title);
  assert.equal(m.apns.payload.aps.alert.body, expected.body);
  assert.ok(m.apns.payload.aps.alert.title.includes("resilient"));
  assert.ok(m.apns.payload.aps.alert.body.includes("kiên cường"));
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
  assert.equal(m.apns.payload.aps.alert.body, "Chạm vô coi nghĩa liền 👀");
  assert.match(m.data.link, /^wordly:\/\/word\?id=1&w=x&m=&bank=0$/);
});

test("từ/nghĩa rất dài (câu đã lưu) → message vẫn < 4 KB của APNs (review #3)", () => {
  const longVi = "Người học tiếng Anh cần ôn tập thường xuyên để ghi nhớ lâu dài. ".repeat(40); // ~2.500 ký tự có dấu
  const m = buildPushMessage({ token: "T".repeat(160), word: { id: "abc", word: longVi, meaning: longVi, fromBank: false }, now: new Date() });
  const bytes = Buffer.byteLength(JSON.stringify(m), "utf8");
  assert.ok(bytes < 4000, `message ${bytes} bytes`);
  assert.ok(Array.from(m.apns.payload.aps.alert.title).length <= 100);
  assert.ok(m.apns.payload.aps.alert.title.endsWith("…"));
});

test("link cắt w/m theo ký tự rồi mới mã hoá — vẫn đọc lại được", () => {
  const link = pushLink({ id: "1", word: "đ".repeat(200), meaning: "ờ".repeat(300), fromBank: false });
  const u = new URL(link.replace("wordly://", "https://x/"));
  assert.equal(Array.from(u.searchParams.get("w")).length, 60);
  assert.equal(Array.from(u.searchParams.get("m")).length, 120);
});
