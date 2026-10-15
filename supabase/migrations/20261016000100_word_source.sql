-- Nguồn từ chung + lịch widget lên server (spec 2026-10-15-shared-word-source-design.md §2, §3, §7).
-- Widget và push trước đây lấy từ từ hai nguồn khác nhau (cài đặt trên máy vs
-- chỉ từ đã lưu) và push không biết widget đang hiện gì → cần cài đặt nguồn từ
-- và lịch widget nằm trên server. Mọi FK tới auth.users ON DELETE CASCADE.

BEGIN;

-- ── Cài đặt nguồn từ: một dòng mỗi người, chưa có dòng = mặc định ───────────
CREATE TABLE public.word_source_settings (
  user_id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  include_saved boolean NOT NULL DEFAULT true,
  include_bank  boolean NOT NULL DEFAULT true,
  -- id translate_history; KHÔNG FK: ghim trỏ tới từ đã xoá được giữ lại để
  -- hoàn tác xoá thì từ tự ghim lại (spec §2.2 mục 3) — bỏ qua khi đọc.
  pinned_ids    uuid[] NOT NULL DEFAULT '{}',
  pinned_only   boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT word_source_settings_pinned_max CHECK (cardinality(pinned_ids) <= 30)
);
ALTER TABLE public.word_source_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY word_source_settings_select_own ON public.word_source_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY word_source_settings_insert_own ON public.word_source_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY word_source_settings_update_own ON public.word_source_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Lịch widget 48 giờ tới: app gửi lại mỗi khi tính lại widget ─────────────
-- Push đọc để tránh gửi đúng từ đang trên widget và ưu tiên từ đã hiện 6–48
-- giờ trước. Dòng đã qua giữ tới 3 ngày rồi cron dọn (sync_widget_schedule).
CREATE TABLE public.widget_schedule (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shown_at     timestamptz NOT NULL,
  -- translate_history.id và words.id đều là uuid (baseline). Xoá từ (cứng) thì
  -- dòng lịch đi theo — lịch chỉ là gợi ý, không cần giữ.
  entry_id     uuid REFERENCES public.translate_history(id) ON DELETE CASCADE,
  bank_word_id uuid REFERENCES public.words(id) ON DELETE CASCADE,
  -- Cron đã chép dòng này sang suggestion_log (tab "Đã nhắc") chưa — đánh dấu
  -- trong cùng câu lệnh để hai lượt cron chồng nhau không chép đôi.
  logged       boolean NOT NULL DEFAULT false,
  CONSTRAINT widget_schedule_one_id CHECK ((entry_id IS NULL) <> (bank_word_id IS NULL))
);
CREATE INDEX widget_schedule_user_shown_idx ON public.widget_schedule (user_id, shown_at);
-- Cron quét theo giờ trên mọi người dùng (chép + dọn)
CREATE INDEX widget_schedule_shown_idx ON public.widget_schedule (shown_at) WHERE NOT logged;
ALTER TABLE public.widget_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY widget_schedule_select_own ON public.widget_schedule
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Không cho tự đánh dấu logged: dòng do người dùng ghi luôn chờ cron chép
CREATE POLICY widget_schedule_insert_own ON public.widget_schedule
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND NOT logged);
CREATE POLICY widget_schedule_delete_own ON public.widget_schedule
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
-- Không có policy UPDATE: app thay lịch bằng xoá dòng tương lai rồi chèn lại.

-- ── Cron: chép lịch đã qua sang suggestion_log + dọn dòng cũ ─────────────────
-- Chỉ chép dòng trong cửa sổ giữ (p_keep_days): dòng cũ hơn mà chưa chép là
-- bất thường (cron ngừng lâu), ghi vào "Đã nhắc" lúc đó chỉ gây nhiễu.
CREATE FUNCTION public.sync_widget_schedule(p_now timestamptz DEFAULT now(), p_keep_days int DEFAULT 3, p_limit int DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_logged int; v_cleaned int;
BEGIN
  WITH due AS (
    SELECT id FROM widget_schedule
    WHERE NOT logged AND shown_at <= p_now AND shown_at > p_now - make_interval(days => p_keep_days)
    ORDER BY shown_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE widget_schedule w SET logged = true
    FROM due WHERE w.id = due.id
    RETURNING w.user_id, w.entry_id, w.bank_word_id, w.shown_at
  )
  INSERT INTO suggestion_log (user_id, source, entry_type, entry_id, bank_word_id, shown_at)
  SELECT user_id, 'widget',
         CASE WHEN bank_word_id IS NULL THEN 'translate_history' ELSE 'bank' END,
         entry_id, bank_word_id, shown_at
  FROM moved;
  GET DIAGNOSTICS v_logged = ROW_COUNT;

  DELETE FROM widget_schedule WHERE id IN (
    SELECT id FROM widget_schedule WHERE shown_at < p_now - make_interval(days => p_keep_days) LIMIT p_limit);
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;
  RETURN jsonb_build_object('logged', v_logged, 'cleaned', v_cleaned);
END $$;
REVOKE ALL ON FUNCTION public.sync_widget_schedule(timestamptz, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_widget_schedule(timestamptz, int, int) TO service_role;

COMMENT ON TABLE public.word_source_settings IS 'Nguồn từ dùng chung cho widget + push (spec 2026-10-15). Chưa có dòng = mặc định.';
COMMENT ON TABLE public.widget_schedule IS 'Lịch widget 48 giờ tới do app gửi (PUT /api/widget/schedule); push đọc để chọn từ, cron chép dòng đã qua sang suggestion_log.';

COMMIT;
