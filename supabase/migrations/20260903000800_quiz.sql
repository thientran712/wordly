-- ════════════════════════════════════════════════════════════════════════════
-- GĐ2 — Quiz / game ôn từ vựng
--
-- Quiz sinh từ kho 7.5k từ sẵn có nên KHÔNG cần bảng câu hỏi — câu hỏi được
-- sinh ngay lúc chơi (xem src/lib/quiz-generation.js). Chỉ cần lưu LƯỢT CHƠI
-- để tính điểm, xếp hạng và cho giáo viên theo dõi.
--
-- Thiết kế này giữ chi phí gần bằng 0: không soạn nội dung, không gọi AI.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Lượt chơi có thể thuộc một lớp (giáo viên theo dõi) hoặc tự do (B2C).
  -- NULL = người dùng tự chơi ngoài lớp.
  class_id      UUID REFERENCES classes(id) ON DELETE SET NULL,
  org_id        UUID REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,

  mode          TEXT NOT NULL CHECK (mode IN ('en_to_vi', 'vi_to_en')),
  total         INTEGER NOT NULL CHECK (total > 0 AND total <= 100),
  correct       INTEGER NOT NULL CHECK (correct >= 0),
  percent       INTEGER NOT NULL CHECK (percent BETWEEN 0 AND 100),
  duration_ms   INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),

  -- Từ nào đúng/sai — dùng để đẩy từ sai vào hàng đợi ôn tập
  word_results  JSONB NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT quiz_correct_lte_total CHECK (correct <= total)
);

CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_class_idx ON quiz_attempts (class_id, created_at DESC)
  WHERE class_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quiz_attempts FROM anon;
GRANT SELECT, INSERT ON quiz_attempts TO authenticated;

-- Người chơi xem lượt của mình
DROP POLICY IF EXISTS quiz_attempts_select_own ON quiz_attempts;
CREATE POLICY quiz_attempts_select_own ON quiz_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Giáo viên xem lượt chơi của học viên trong lớp mình dạy
DROP POLICY IF EXISTS quiz_attempts_select_staff ON quiz_attempts;
CREATE POLICY quiz_attempts_select_staff ON quiz_attempts
  FOR SELECT TO authenticated
  USING (
    class_id IS NOT NULL
    AND (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  );

-- Người chơi tự ghi lượt của mình. KHÔNG cho UPDATE — điểm đã ghi là cố
-- định, nếu cho sửa thì người chơi tự nâng điểm được.
DROP POLICY IF EXISTS quiz_attempts_insert_own ON quiz_attempts;
CREATE POLICY quiz_attempts_insert_own ON quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE quiz_attempts IS 'Lượt chơi quiz. Câu hỏi KHÔNG lưu — sinh từ kho từ vựng lúc chơi để chi phí bằng 0. Không cho UPDATE để người chơi không tự nâng điểm.';
