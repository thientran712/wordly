// Test cho toPlainTextStream — luồng chat Alex (/api/practice).
//
// LỖI THẬT (6/10/2026): /api/practice trả câu trả lời bị cụt ("…What'") rồi
// TREO tới timeout 60s, cả local lẫn Vercel. Nguyên nhân: mỗi lần pull() chỉ
// đọc MỘT chunk từ nhà cung cấp; chunk không sinh ra chữ nào (nửa dòng SSE,
// dòng [DONE], chunk chỉ có finish_reason) → không enqueue → theo chuẩn Web
// Streams pull() không được gọi lại → luồng đứng im mãi.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { toPlainTextStream } from "../../src/lib/ai/sse-to-text.js";

const enc = new TextEncoder();
const upstream = (chunks) =>
  new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
const sse = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

// Đọc hết luồng; treo quá 2s coi như lỗi (đúng triệu chứng thật)
async function readAll(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("luồng TREO, không đóng")), 2000));
  const run = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return out;
      out += dec.decode(value, { stream: true });
    }
  })();
  return Promise.race([run, timeout]);
}

describe("toPlainTextStream", () => {
  test("ghép đủ các delta và đóng luồng", async () => {
    const text = await readAll(toPlainTextStream(upstream([sse("Hi "), sse("there"), "data: [DONE]\n\n"])));
    assert.equal(text, "Hi there");
  });

  test("dòng SSE bị cắt đôi giữa 2 chunk mạng → không mất chữ, không treo", async () => {
    const line = sse("What's up?");
    const text = await readAll(toPlainTextStream(upstream([sse("Hi! "), line.slice(0, 20), line.slice(20)])));
    assert.equal(text, "Hi! What's up?");
  });

  test("chunk không có chữ (chỉ finish_reason) ở giữa → không treo", async () => {
    const finish = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`;
    const text = await readAll(toPlainTextStream(upstream([sse("A"), finish, sse("B")])));
    assert.equal(text, "AB");
  });

  test("dòng cuối không có xuống dòng → vẫn lấy được chữ", async () => {
    const last = `data: ${JSON.stringify({ choices: [{ delta: { content: "end" } }] })}`;
    const text = await readAll(toPlainTextStream(upstream([sse("the "), last])));
    assert.equal(text, "the end");
  });

  test("luồng không có chữ nào → đóng, trả chuỗi rỗng", async () => {
    const text = await readAll(toPlainTextStream(upstream(["data: [DONE]\n\n"])));
    assert.equal(text, "");
  });
});
