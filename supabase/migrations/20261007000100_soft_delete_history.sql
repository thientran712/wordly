-- Xoá mềm cho lịch sử dịch và sổ tay câu hay.
--
-- Trước đây xoá = DELETE thật; "Xoá hết" xoá luôn từ đã lưu. Ngày 7/10/2026
-- một người dùng bấm nhầm và mất toàn bộ (project gói Free, không có backup —
-- chỉ cứu được 106 từ nhờ nội dung email nhắc học). Từ nay xoá chỉ đánh dấu
-- deleted_at; app lọc `deleted_at is null` khi đọc, hoàn tác = đặt lại null.
--
-- Chuỗi ngày học (stats/streak) và student_progress_snapshots vẫn đếm dòng
-- đã xoá: hôm đó người học thật sự đã học.

alter table public.translate_history add column if not exists deleted_at timestamptz;
alter table public.journal_entries  add column if not exists deleted_at timestamptz;

-- Truy vấn chính (lịch sử theo người dùng, mới nhất trước) chỉ đọc dòng còn hiện
create index if not exists translate_history_user_visible_idx
  on public.translate_history (user_id, saved_at desc) where deleted_at is null;
create index if not exists journal_entries_user_visible_idx
  on public.journal_entries (user_id, created_at desc) where deleted_at is null;
