import test from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../../src/lib/push/run-pool.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("không quá N việc cùng lúc, chạy hết", async () => {
  let running = 0, peak = 0;
  const r = await runPool(Array.from({ length: 50 }, (_, i) => i), async () => {
    running++; peak = Math.max(peak, running); await sleep(2); running--;
  }, { concurrency: 5 });
  assert.equal(peak, 5);
  assert.deepEqual({ completed: r.completed, failed: r.failed, deferred: r.deferred }, { completed: 50, failed: 0, deferred: 0 });
});

test("một việc lỗi không dừng việc khác; đếm failed + giữ tối đa 5 lỗi", async () => {
  const r = await runPool([1, 2, 3, 4, 5, 6, 7], async (i) => { if (i % 2) throw new Error(`e${i}`); }, { concurrency: 2 });
  assert.equal(r.completed, 3);
  assert.equal(r.failed, 4);
  assert.equal(r.errors.length, 4);
  const many = await runPool(Array.from({ length: 9 }, (_, i) => i), async () => { throw new Error("x"); });
  assert.equal(many.errors.length, 5);
});

test("hết hạn thời gian → không nhận việc mới, đếm deferred", async () => {
  let now = 0;
  const r = await runPool([1, 2, 3, 4], async () => { now += 100; }, { concurrency: 1, budgetMs: 250, clock: () => now });
  assert.equal(r.completed, 3);
  assert.equal(r.deferred, 1);
});

test("shouldStop → dừng nhận việc mới", async () => {
  let stop = false;
  const r = await runPool([1, 2, 3, 4], async (i) => { if (i === 2) stop = true; }, { concurrency: 1, shouldStop: () => stop });
  assert.equal(r.completed, 2);
  assert.equal(r.deferred, 2);
});

test("danh sách rỗng", async () => {
  assert.deepEqual(await runPool([], async () => {}), { completed: 0, failed: 0, deferred: 0, errors: [] });
});
