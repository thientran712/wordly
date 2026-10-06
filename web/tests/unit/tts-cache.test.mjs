// Test cho cache audio TTS bền vững (R2).
//
// VÌ SAO CẦN: cache cũ chỉ là Map trong RAM của 1 instance serverless — trên
// Vercel gần như luôn trống, nên cùng một từ đọc 100 lần là Google tính phí
// 100 lần (billing Google Cloud đã bật 6/10/2026). Lưu audio lên R2 (không
// phí băng thông tải xuống) để mỗi (giọng, câu) chỉ tổng hợp MỘT lần.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ttsCacheKey, getOrCreateAudio } from "../../src/lib/storage/tts-cache.js";

// Kho giả trong bộ nhớ, cùng giao diện get/put như R2
function fakeStore({ failGet = false, failPut = false } = {}) {
  const data = new Map();
  return {
    data,
    gets: 0,
    puts: 0,
    async get(key) {
      this.gets++;
      if (failGet) throw new Error("R2 down");
      return data.get(key) ?? null;
    },
    async put(key, bytes) {
      this.puts++;
      if (failPut) throw new Error("R2 down");
      data.set(key, bytes);
    },
  };
}

const audio = Buffer.from("mp3-bytes");

describe("ttsCacheKey", () => {
  test("cùng giọng + cùng câu → cùng key; key có tiền tố tts/ và đuôi .mp3", () => {
    const a = ttsCacheKey("en-US-Neural2-D", "hello");
    assert.equal(a, ttsCacheKey("en-US-Neural2-D", "hello"));
    assert.match(a, /^tts\/v1\/en-US-Neural2-D\/[0-9a-f]{64}\.mp3$/);
  });

  test("khác giọng hoặc khác câu → khác key", () => {
    assert.notEqual(ttsCacheKey("en-US-Neural2-D", "hello"), ttsCacheKey("en-GB-Neural2-D", "hello"));
    assert.notEqual(ttsCacheKey("en-US-Neural2-D", "hello"), ttsCacheKey("en-US-Neural2-D", "hello!"));
  });

  test("khoảng trắng đầu/cuối không tạo key mới", () => {
    assert.equal(ttsCacheKey("v", "  hello  "), ttsCacheKey("v", "hello"));
  });

  test("key không chứa nội dung câu (không lộ chữ người dùng)", () => {
    assert.ok(!ttsCacheKey("v", "my secret journal").includes("secret"));
  });
});

describe("getOrCreateAudio", () => {
  test("lần đầu: gọi Google, lưu R2, trả source=google", async () => {
    const store = fakeStore(); const memory = new Map(); let synth = 0;
    const r = await getOrCreateAudio({ key: "k", memory, store, synthesize: async () => { synth++; return audio; } });
    assert.equal(r.source, "google");
    assert.equal(synth, 1);
    assert.equal(store.puts, 1);
    assert.deepEqual(store.data.get("k"), audio);
  });

  test("instance mới (RAM trống) nhưng R2 có → KHÔNG gọi Google", async () => {
    const store = fakeStore(); store.data.set("k", audio); let synth = 0;
    const r = await getOrCreateAudio({ key: "k", memory: new Map(), store, synthesize: async () => { synth++; return audio; } });
    assert.equal(r.source, "r2");
    assert.equal(synth, 0);
    assert.deepEqual(r.audio, audio);
  });

  test("RAM có → không đụng R2 lẫn Google", async () => {
    const store = fakeStore(); const memory = new Map([["k", audio]]);
    const r = await getOrCreateAudio({ key: "k", memory, store, synthesize: async () => { throw new Error("không được gọi"); } });
    assert.equal(r.source, "memory");
    assert.equal(store.gets, 0);
  });

  test("R2 lỗi khi đọc → vẫn trả audio từ Google (phát âm không hỏng vì cache)", async () => {
    const r = await getOrCreateAudio({ key: "k", memory: new Map(), store: fakeStore({ failGet: true }), synthesize: async () => audio });
    assert.equal(r.source, "google");
    assert.deepEqual(r.audio, audio);
  });

  test("R2 lỗi khi ghi → vẫn trả audio, không throw", async () => {
    const r = await getOrCreateAudio({ key: "k", memory: new Map(), store: fakeStore({ failPut: true }), synthesize: async () => audio });
    assert.equal(r.source, "google");
  });

  test("lần 2 cùng instance → lấy từ RAM", async () => {
    const store = fakeStore(); const memory = new Map(); let synth = 0;
    const args = { key: "k", memory, store, synthesize: async () => { synth++; return audio; } };
    await getOrCreateAudio(args);
    const r = await getOrCreateAudio(args);
    assert.equal(r.source, "memory");
    assert.equal(synth, 1);
  });

  test("Google lỗi → throw để route trả lỗi (không lưu gì)", async () => {
    const store = fakeStore();
    await assert.rejects(getOrCreateAudio({ key: "k", memory: new Map(), store, synthesize: async () => { throw new Error("billing"); } }), /billing/);
    assert.equal(store.puts, 0);
  });
});
