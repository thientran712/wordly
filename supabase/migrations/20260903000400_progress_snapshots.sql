-- ════════════════════════════════════════════════════════════════════════════
-- 0004 — Progress Snapshots: số liệu cho dashboard giáo viên
--
-- Quyết định thiết kế quan trọng (spec mục 2.2c):
-- Dữ liệu học tập cá nhân (translate_history, journal_entries,
-- practice_sessions) KHÔNG mang org_id và giáo viên KHÔNG đọc trực tiếp.
-- Thay vào đó GV đọc bảng tổng hợp này.
--
-- Lợi ích kép:
--   1. Quyền riêng tư — GV thấy TIẾN ĐỘ, không đọc được nhật ký cá nhân HV.
--      Đây là điểm bán hàng với học viên, không chỉ là kỹ thuật.
--   2. Performance — dashboard query một bảng nhỏ đã tổng hợp, không join
--      vào bảng lịch sử hàng triệu dòng.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS student_progress_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id  UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date  DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Chỉ số tổng hợp — không có nội dung học tập nào.
  words_saved      INTEGER NOT NULL DEFAULT 0,
  words_due        INTEGER NOT NULL DEFAULT 0,
  streak_days      INTEGER NOT NULL DEFAULT 0,
  last_active_at   TIMESTAMPTZ,
  emails_sent      INTEGER NOT NULL DEFAULT 0,
  practice_minutes INTEGER NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (membership_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS progress_snapshots_org_date_idx
  ON student_progress_snapshots (org_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS progress_snapshots_membership_idx
  ON student_progress_snapshots (membership_id, snapshot_date DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE student_progress_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_progress_snapshots FROM anon;
GRANT SELECT ON student_progress_snapshots TO authenticated;

-- Học viên xem tiến độ của chính mình.
DROP POLICY IF EXISTS progress_select_self ON student_progress_snapshots;
CREATE POLICY progress_select_self ON student_progress_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = student_progress_snapshots.membership_id
        AND m.user_id = auth.uid()
    )
  );

-- Owner xem toàn org.
DROP POLICY IF EXISTS progress_select_owner ON student_progress_snapshots;
CREATE POLICY progress_select_owner ON student_progress_snapshots
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id));

-- Giáo viên CHỈ xem học viên trong lớp mình dạy — không phải toàn org.
DROP POLICY IF EXISTS progress_select_teacher ON student_progress_snapshots;
CREATE POLICY progress_select_teacher ON student_progress_snapshots
  FOR SELECT TO authenticated
  USING (
    public.is_org_staff(org_id)
    AND EXISTS (
      SELECT 1
      FROM class_members target_cm
      JOIN class_members my_cm ON my_cm.class_id = target_cm.class_id
      JOIN memberships my_m ON my_m.id = my_cm.membership_id
      WHERE target_cm.membership_id = student_progress_snapshots.membership_id
        AND my_m.user_id = auth.uid()
        AND my_cm.role_in_class IN ('teacher', 'assistant')
    )
  );

-- Ghi CHỈ qua service role (Inngest cron) — không mở cho người dùng.

-- ════════════════════════════════════════════════════════════════════════════
-- Hàm tính snapshot cho một org
--
-- Chạy trong DB thay vì kéo dữ liệu về Node: dữ liệu học tập nằm ngay đây,
-- và cách này tránh việc job phải đọc nội dung học tập cá nhân ra ngoài.
-- ════════════════════════════════════════════════════════════════════════════

-- Streak cho một user. Khớp CHÍNH XÁC định nghĩa đang dùng ở
-- src/app/api/stats/streak/route.js để hai nơi không cho ra số khác nhau:
--   • đếm số ngày LIÊN TIẾP có hoạt động, tính lùi từ ngày mới nhất
--   • chỉ tính nếu ngày mới nhất là hôm nay hoặc hôm qua, ngược lại = 0
-- Dùng kỹ thuật gaps-and-islands: khi sắp xếp GIẢM dần, các ngày liên tiếp
-- có (date + row_number) không đổi, nên nhóm đầu tiên chính là streak hiện
-- tại. Lưu ý dấu CỘNG — thứ tự giảm dần thì phải cộng, dùng trừ sẽ luôn
-- trả về 1 (đã kiểm chứng bằng 8 ca test đối chiếu với thuật toán JS).
CREATE OR REPLACE FUNCTION public.user_streak_days(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH days AS (
    SELECT DISTINCT saved_at::date AS d
    FROM translate_history
    WHERE user_id = p_user_id AND saved_at IS NOT NULL
  ),
  ranked AS (
    SELECT d, d + (ROW_NUMBER() OVER (ORDER BY d DESC))::integer AS grp
    FROM days
  ),
  latest AS (
    SELECT MAX(d) AS max_d FROM days
  )
  SELECT COALESCE((
    SELECT COUNT(*)::integer
    FROM ranked
    WHERE grp = (
      SELECT grp FROM ranked ORDER BY d DESC LIMIT 1
    )
    -- Streak chỉ "sống" khi hoạt động gần nhất là hôm nay hoặc hôm qua.
    AND (SELECT max_d FROM latest) >= CURRENT_DATE - 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.user_streak_days(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.compute_org_progress_snapshots(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO student_progress_snapshots (
    membership_id, org_id, snapshot_date,
    words_saved, words_due, streak_days, last_active_at, emails_sent
  )
  SELECT
    m.id,
    m.org_id,
    CURRENT_DATE,
    COALESCE(th.words_saved, 0),
    COALESCE(th.words_due, 0),
    public.user_streak_days(m.user_id),
    th.last_active_at,
    COALESCE(el.emails_sent, 0)
  FROM memberships m
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE is_saved)                     AS words_saved,
      COUNT(*) FILTER (WHERE is_saved AND due_at <= now()) AS words_due,
      MAX(saved_at)                                        AS last_active_at
    FROM translate_history
    WHERE user_id = m.user_id
  ) th ON TRUE
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS emails_sent
    FROM email_log
    WHERE user_id = m.user_id AND status = 'sent'
  ) el ON TRUE
  WHERE m.org_id = p_org_id
    AND m.user_id IS NOT NULL
    AND m.status = 'active'
    AND m.role = 'student'
  ON CONFLICT (membership_id, snapshot_date) DO UPDATE SET
    words_saved    = EXCLUDED.words_saved,
    words_due      = EXCLUDED.words_due,
    streak_days    = EXCLUDED.streak_days,
    last_active_at = EXCLUDED.last_active_at,
    emails_sent    = EXCLUDED.emails_sent;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.compute_org_progress_snapshots(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE student_progress_snapshots IS 'Số liệu tiến độ tổng hợp cho dashboard GV. Không chứa nội dung học tập — GV thấy tiến độ, không đọc nhật ký cá nhân HV.';
COMMENT ON FUNCTION public.compute_org_progress_snapshots(uuid) IS 'Tính snapshot hằng ngày cho một org. Gọi từ Inngest cron qua service role.';
