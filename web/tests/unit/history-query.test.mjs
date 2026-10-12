import test from "node:test";
import assert from "node:assert/strict";
import { parseHistoryQuery } from "../../src/lib/learning/history-query.js";

const q = (s) => new URLSearchParams(s);

test("parseHistoryQuery: mặc định 20 dòng, mọi bản dịch", () => {
  assert.deepEqual(parseHistoryQuery(q("")), { limit: 20, offset: 0, savedOnly: false });
});

test("parseHistoryQuery: lịch sử thường tối đa 50 dòng/lần", () => {
  assert.equal(parseHistoryQuery(q("limit=500")).limit, 50);
});

test("parseHistoryQuery: saved=1 lấy riêng từ đã lưu, cho tới 200 dòng một lần", () => {
  assert.deepEqual(parseHistoryQuery(q("saved=1&limit=200")), { limit: 200, offset: 0, savedOnly: true });
  assert.equal(parseHistoryQuery(q("saved=1&limit=999")).limit, 200);
});

test("parseHistoryQuery: tham số rác không làm hỏng truy vấn", () => {
  assert.deepEqual(parseHistoryQuery(q("limit=abc&offset=-5")), { limit: 20, offset: 0, savedOnly: false });
  assert.equal(parseHistoryQuery(q("limit=0")).limit, 1);
});
