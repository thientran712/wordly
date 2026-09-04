// Test cho lớp chọn nhà cung cấp AI (Gemini chính, Groq dự phòng).
//
// Vì sao test này tồn tại: tháng 9/2026 Groq ngừng 2 model app đang dùng →
// mọi tính năng AI sập cùng lúc. Bài học là KHÔNG được phụ thuộc một nhà
// cung cấp. Test này khoá lại hành vi dự phòng để sự cố đó không lặp lại.
//
// Điều kiện thật đã gặp khi đo tay:
//   • Gemini trả 503 "high demand" — xảy ra thật với gemini-flash-latest
//   • Gemini trả 404 khi model bị bỏ cho user mới (gemini-2.5-pro)
//   • Gemini trả 429 khi hết quota (gemini-pro-latest)
// Cả ba đều PHẢI tụt xuống Groq chứ không được làm sập tính năng.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MODELS, PROVIDERS, callAI, callGroq } from "../../src/lib/ai-models.js";

const realFetch = globalThis.fetch;

// Ghi lại mọi lượt gọi để khẳng định ĐÚNG THỨ TỰ provider/model
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url: String(url), model: body.model, auth: opts.headers.Authorization });
    return handler(body.model, String(url), calls.length);
  };
  return calls;
}

const ok = (content = '{"ok":true}') =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200, headers: { "content-type": "application/json" },
  });
const fail = (status, msg = "err") =>
  new Response(JSON.stringify({ error: { message: msg } }), { status });

beforeEach(() => {
  process.env.GEMINI_API_KEY = "fake-gemini-key";
  process.env.GROQ_API_KEY = "fake-groq-key";
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("cấu hình model", () => {
  test("mỗi vai trò có model Gemini ĐỨNG TRƯỚC model Groq", () => {
    for (const role of ["fast", "quality"]) {
      const ladder = MODELS[role];
      assert.ok(Array.isArray(ladder) && ladder.length >= 2, `${role} phải có ladder`);
      const firstGroq = ladder.findIndex((m) => m.provider === "groq");
      const lastGemini = ladder.map((m) => m.provider).lastIndexOf("gemini");
      assert.ok(ladder[0].provider === "gemini", `${role}: model đầu phải là Gemini`);
      assert.ok(firstGroq > lastGemini, `${role}: Groq phải nằm sau toàn bộ Gemini`);
    }
  });

  test("KHÔNG dùng model Gemini thinking chậm (đo thật 15-18s)", () => {
    // gemini-3-flash-preview và gemini-3.8-flash mất 15-18s cho 1 request
    // JSON nhỏ. Thẻ từ vựng là chỗ người dùng ngồi chờ → không dùng được.
    const banned = ["gemini-3-flash-preview", "gemini-3.8-flash", "gemini-2.5-pro", "gemini-pro-latest"];
    for (const role of ["fast", "quality"]) {
      for (const m of MODELS[role]) {
        assert.ok(!banned.includes(m.model), `${role} không được dùng ${m.model}`);
      }
    }
  });

  test("Whisper vẫn ở Groq — Gemini không có endpoint transcription tương thích", () => {
    assert.ok(MODELS.transcribe.every((m) => m.provider === "groq" || typeof m === "string"));
  });
});

describe("callAI — thứ tự dự phòng", () => {
  test("Gemini thành công thì KHÔNG gọi Groq", async () => {
    const calls = mockFetch(() => ok());
    const { res, model, provider } = await callAI("fast", { messages: [] });
    assert.equal(res.status, 200);
    assert.equal(provider, "gemini");
    assert.equal(calls.length, 1, "chỉ được gọi 1 lượt");
    assert.ok(calls[0].url.includes("generativelanguage.googleapis.com"));
    assert.equal(calls[0].auth, "Bearer fake-gemini-key");
    assert.ok(model);
  });

  test("Gemini 503 (high demand) → tụt xuống model Gemini kế, rồi Groq", async () => {
    const calls = mockFetch((m) => (m.startsWith("gemini") ? fail(503, "high demand") : ok()));
    const { provider } = await callAI("fast", { messages: [] });
    assert.equal(provider, "groq", "phải về được Groq");
    const providersTried = calls.map((c) => (c.url.includes("googleapis") ? "gemini" : "groq"));
    assert.ok(providersTried.filter((p) => p === "gemini").length >= 2, "phải thử hết Gemini trước");
    assert.equal(providersTried.at(-1), "groq");
  });

  test("Gemini 404 (model bị bỏ) → vẫn phục vụ được qua Groq", async () => {
    mockFetch((m) => (m.startsWith("gemini") ? fail(404, "no longer available") : ok()));
    const { provider } = await callAI("quality", { messages: [] });
    assert.equal(provider, "groq");
  });

  test("Gemini 429 (hết quota) → sang Groq, KHÔNG chờ retry dài", async () => {
    mockFetch((m) => (m.startsWith("gemini") ? fail(429, "quota") : ok()));
    const t0 = Date.now();
    const { provider } = await callAI("fast", { messages: [] });
    assert.equal(provider, "groq");
    assert.ok(Date.now() - t0 < 3000, "429 của Gemini không được chờ lâu vì đã có Groq");
  });

  test("Gemini lỗi mạng (throw) → vẫn sang Groq", async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes("googleapis")) throw new Error("ECONNRESET");
      return ok();
    };
    const { provider } = await callAI("fast", { messages: [] });
    assert.equal(provider, "groq");
  });

  test("CẢ HAI nhà cung cấp chết → throw để route trả lỗi rõ ràng", async () => {
    mockFetch(() => fail(500, "down"));
    await assert.rejects(() => callAI("fast", { messages: [] }), /.+/);
  });

  test("thiếu GEMINI_API_KEY → bỏ qua Gemini, chạy thẳng Groq", async () => {
    delete process.env.GEMINI_API_KEY;
    const calls = mockFetch(() => ok());
    const { provider } = await callAI("fast", { messages: [] });
    assert.equal(provider, "groq");
    assert.ok(calls.every((c) => !c.url.includes("googleapis")), "không được gọi Gemini khi thiếu key");
  });

  test("AbortSignal phải nổi lên ngay, không được thử model khác", async () => {
    let n = 0;
    globalThis.fetch = async () => { n++; const e = new Error("aborted"); e.name = "AbortError"; throw e; };
    await assert.rejects(() => callAI("fast", { messages: [] }), (e) => e.name === "AbortError");
    assert.equal(n, 1, "abort là chủ ý của người dùng — dừng ngay");
  });
});

describe("tương thích ngược", () => {
  test("callGroq vẫn dùng được — 9 chỗ gọi cũ không phải sửa", async () => {
    mockFetch(() => ok());
    const { res } = await callGroq("fast", { messages: [] });
    assert.equal(res.status, 200);
  });

  test("body gửi lên Gemini giữ nguyên tham số OpenAI (response_format, stream)", async () => {
    let sent = null;
    globalThis.fetch = async (url, opts) => { sent = JSON.parse(opts.body); return ok(); };
    await callAI("fast", {
      messages: [{ role: "user", content: "x" }],
      temperature: 0.3, max_tokens: 600,
      response_format: { type: "json_object" },
    });
    assert.deepEqual(sent.response_format, { type: "json_object" });
    assert.equal(sent.temperature, 0.3);
    assert.equal(sent.max_tokens, 600);
    assert.equal(sent.messages[0].content, "x");
  });

  test("dùng endpoint tương thích OpenAI của Gemini để shape choices[0] không đổi", async () => {
    const calls = mockFetch(() => ok());
    await callAI("fast", { messages: [] });
    assert.ok(calls[0].url.includes("/openai/chat/completions"),
      "phải là endpoint tương thích OpenAI, nếu không streaming SSE và choices[0] sẽ vỡ");
  });
});

describe("PROVIDERS", () => {
  test("khai báo đủ url + tên biến môi trường cho cả hai", () => {
    assert.ok(PROVIDERS.gemini.url.includes("openai/chat/completions"));
    assert.ok(PROVIDERS.groq.url.includes("api.groq.com"));
    assert.equal(PROVIDERS.gemini.keyEnv, "GEMINI_API_KEY");
    assert.equal(PROVIDERS.groq.keyEnv, "GROQ_API_KEY");
  });
});
