import test from "node:test";
import assert from "node:assert/strict";
import { runWidgetScheduleSync, SCHEDULE_KEEP_DAYS } from "../../src/lib/widget/sync-schedule.js";

const now = new Date("2026-10-16T13:00:00Z");

test("gọi hàm SQL sync_widget_schedule với giờ của lượt cron, giữ 3 ngày", async () => {
  const calls = [];
  const sb = { rpc: async (name, args) => { calls.push([name, args]); return { data: { logged: 4, cleaned: 2 }, error: null }; } };
  assert.deepEqual(await runWidgetScheduleSync(sb, now), { logged: 4, cleaned: 2 });
  assert.equal(SCHEDULE_KEEP_DAYS, 3);
  assert.deepEqual(calls, [["sync_widget_schedule", { p_now: now.toISOString(), p_keep_days: 3 }]]);
});

test("lỗi SQL → throw (runReminderCron ghi lỗi riêng, push vẫn chạy)", async () => {
  const sb = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
  await assert.rejects(() => runWidgetScheduleSync(sb, now), /sync_widget_schedule: boom/);
});
