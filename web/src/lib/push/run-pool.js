// Chạy `worker` cho từng item, tối đa `concurrency` việc cùng lúc. Quá
// `budgetMs` hoặc `shouldStop()` → không nhận việc mới (việc đang chạy chạy
// nốt); phần còn lại đếm `deferred` — lượt cron sau gửi bù (cửa sổ 30 phút).

export async function runPool(items, worker, {
  concurrency = 20,
  budgetMs = 240_000,
  clock = () => Date.now(),
  shouldStop = () => false,
} = {}) {
  const start = clock();
  let next = 0;
  let completed = 0;
  let failed = 0;
  const errors = [];

  async function lane() {
    while (next < items.length) {
      if (shouldStop() || clock() - start >= budgetMs) return;
      const item = items[next++];
      try {
        await worker(item);
        completed++;
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(e?.message || String(e));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return { completed, failed, deferred: items.length - completed - failed, errors };
}
