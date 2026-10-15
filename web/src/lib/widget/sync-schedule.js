// Bước cron cho lịch widget (spec 2026-10-15 §3): chép slot đã qua sang
// suggestion_log source = widget (tab "Đã nhắc" vẫn đọc một nguồn) và dọn dòng
// cũ hơn 3 ngày. Làm trong một hàm SQL (sync_widget_schedule) để việc đánh dấu
// "đã chép" và chèn log nằm chung một câu lệnh — hai lượt cron chồng nhau
// không chép đôi, cron ngừng một lúc thì lượt sau tự chép bù.
export const SCHEDULE_KEEP_DAYS = 3; // push cần "đã hiện 6–48 giờ trước" + dư

export async function runWidgetScheduleSync(supabase, now = new Date()) {
  const { data, error } = await supabase.rpc("sync_widget_schedule", {
    p_now: now.toISOString(), p_keep_days: SCHEDULE_KEEP_DAYS,
  });
  if (error) throw new Error(`sync_widget_schedule: ${error.message}`);
  return data;
}
