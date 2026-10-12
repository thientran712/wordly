// Test cho việc xâu chuỗi nhiều hạn mức (vd. theo phút + theo ngày) trên
// cùng một route AI.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { firstBlockedLimit } from "../../src/lib/security/rate-limit-db.js";

const allow = { allowed: true, remaining: 5, retry_after_seconds: 0, limit: 10 };
const block = (limit) => ({ allowed: false, remaining: 0, retry_after_seconds: 30, limit });

describe("firstBlockedLimit — chạy lần lượt các hạn mức", () => {
  test("mọi hạn mức đều cho qua → null", async () => {
    assert.equal(await firstBlockedLimit([async () => allow, async () => allow]), null);
  });

  test("trả về kết quả của hạn mức ĐẦU TIÊN chặn", async () => {
    const r = await firstBlockedLimit([async () => allow, async () => block(300), async () => block(1)]);
    assert.equal(r.limit, 300);
  });

  test("hạn mức trước đã chặn thì KHÔNG chạy (không đếm) hạn mức sau", async () => {
    let dayCalls = 0;
    await firstBlockedLimit([async () => block(20), async () => { dayCalls++; return allow; }]);
    assert.equal(dayCalls, 0);
  });

  test("danh sách rỗng → null", async () => {
    assert.equal(await firstBlockedLimit([]), null);
  });
});
