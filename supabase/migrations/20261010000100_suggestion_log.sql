-- Nhật ký "đã gợi ý từ gì, qua kênh nào" — nguồn cho tab "Đã gợi ý" trong
-- trang Lịch sử. Tách khỏi email_log (vẫn giữ nguyên, chỉ theo dõi trạng
-- thái gửi mail) vì widget không có bảng tương đương và cần nguồn chung
-- cho cả hai kênh.
--
-- Xem spec: docs/superpowers/specs/2026-10-10-suggestion-log-review-control-design.md

CREATE TABLE IF NOT EXISTS suggestion_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('email', 'widget')),
  entry_type    text NOT NULL CHECK (entry_type IN ('translate_history', 'journal_entries', 'bank')),
  entry_id      uuid,
  -- CASCADE, không SET NULL: nếu set null thì dòng entry_type='bank' lập tức
  -- vi phạm suggestion_log_entry_shape (yêu cầu bank_word_id NOT NULL) và
  -- không xoá được words nào đã từng được log — xoá luôn dòng log cho sạch.
  bank_word_id  uuid REFERENCES words(id) ON DELETE CASCADE,
  shown_at      timestamptz NOT NULL DEFAULT now(),

  -- entry_id xor bank_word_id, tuỳ entry_type
  CONSTRAINT suggestion_log_entry_shape CHECK (
    (entry_type = 'bank' AND entry_id IS NULL AND bank_word_id IS NOT NULL)
    OR (entry_type IN ('translate_history', 'journal_entries') AND entry_id IS NOT NULL AND bank_word_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS suggestion_log_user_idx ON suggestion_log (user_id, shown_at DESC);

ALTER TABLE suggestion_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON suggestion_log FROM anon;
GRANT SELECT ON suggestion_log TO authenticated;

DROP POLICY IF EXISTS suggestion_log_select_own ON suggestion_log;
CREATE POLICY suggestion_log_select_own ON suggestion_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Không có policy INSERT/UPDATE/DELETE cho authenticated/anon — chỉ service
-- role (API routes dùng createAdminClient(), Inngest job) ghi được vào bảng này.

COMMENT ON TABLE suggestion_log IS 'Nhật ký từ đã gợi ý qua email hoặc widget — nguồn cho tab "Đã gợi ý" trong trang Lịch sử. Không phải nơi theo dõi trạng thái gửi mail (đó là email_log).';
