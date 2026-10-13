import test from "node:test";
import assert from "node:assert/strict";
import { runReminderCron } from "../../src/lib/reminders/run-reminder-cron.js";

test("email lỗi vẫn chạy push và ngược lại", async () => {
  assert.deepEqual(
    await runReminderCron({ email: async () => { throw new Error("smtp"); }, push: async () => ({ sent: 3 }) }),
    { email: { error: "smtp" }, push: { sent: 3 } });
  assert.deepEqual(
    await runReminderCron({ email: async () => ({ checked: 8 }), push: async () => { throw new Error("fcm"); } }),
    { email: { checked: 8 }, push: { error: "fcm" } });
});

test("chạy song song, không đợi lần lượt", async () => {
  const t0 = Date.now();
  const wait = () => new Promise((r) => setTimeout(() => r("ok"), 50));
  await runReminderCron({ email: wait, push: wait });
  assert.ok(Date.now() - t0 < 95);
});
