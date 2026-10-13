// Email và push chạy song song trong cùng lượt cron; lỗi bên này không chặn
// bên kia (spec 2026-10-13 mục 2). Phản hồi: { email: …, push: … }.
export async function runReminderCron(jobs) {
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map((n) => jobs[n]()));
  return Object.fromEntries(names.map((n, i) => [n, settled[i].status === "fulfilled"
    ? settled[i].value
    : { error: settled[i].reason?.message || String(settled[i].reason) }]));
}
