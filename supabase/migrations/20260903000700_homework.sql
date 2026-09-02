-- ════════════════════════════════════════════════════════════════════════════
-- GĐ2 — Bài tập về nhà (homework)
--
-- Khác class_assignments (giao BỘ TỪ để học dần qua email/FSRS): homework là
-- bài tập có ĐỀ, có hạn nộp, có nộp bài và có chấm.
--
-- Thiết kế câu hỏi: lưu dạng JSONB thay vì bảng riêng cho từng loại câu hỏi.
-- Lý do: các loại câu hỏi (chọn đáp án, điền từ, tự luận, ghép đôi) có cấu
-- trúc rất khác nhau; tách bảng sẽ thành 4-5 bảng với nhiều cột NULL. JSONB
-- giữ được sự linh hoạt và đủ nhanh ở quy mô này.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'homework_status') THEN
    CREATE TYPE homework_status AS ENUM ('draft', 'published', 'closed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE submission_status AS ENUM ('in_progress', 'submitted', 'graded');
  END IF;
END $$;

-- ── homework ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES class_sessions(id) ON DELETE SET NULL,

  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  instructions TEXT,

  -- Mảng câu hỏi. Mỗi phần tử:
  --   { id, type: 'mcq'|'fill'|'essay'|'match', prompt, points,
  --     options?: [...], answer?: ..., }
  -- Đáp án KHÔNG được gửi cho học viên — API lọc bỏ trước khi trả về.
  questions    JSONB NOT NULL DEFAULT '[]',

  total_points NUMERIC NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  due_at       TIMESTAMPTZ,
  -- Cho nộp muộn không? Nếu không, quá hạn là chặn nộp.
  allow_late   BOOLEAN NOT NULL DEFAULT true,
  status       homework_status NOT NULL DEFAULT 'draft',

  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT homework_questions_is_array CHECK (jsonb_typeof(questions) = 'array')
);

CREATE INDEX IF NOT EXISTS homework_class_idx ON homework (class_id, status, due_at);
CREATE INDEX IF NOT EXISTS homework_org_idx ON homework (org_id);

DROP TRIGGER IF EXISTS homework_updated_at ON homework;
CREATE TRIGGER homework_updated_at BEFORE UPDATE ON homework
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── homework_submissions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id   UUID NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Câu trả lời: { [question_id]: answer }
  answers       JSONB NOT NULL DEFAULT '{}',

  status        submission_status NOT NULL DEFAULT 'in_progress',
  submitted_at  TIMESTAMPTZ,
  is_late       BOOLEAN NOT NULL DEFAULT false,

  -- Điểm tự động (câu khách quan) và điểm giáo viên chấm (câu tự luận)
  auto_score    NUMERIC,
  manual_score  NUMERIC,
  total_score   NUMERIC,
  feedback      TEXT,
  graded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  graded_at     TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mỗi học viên một bài nộp cho mỗi homework
  UNIQUE (homework_id, membership_id)
);

CREATE INDEX IF NOT EXISTS submissions_homework_idx ON homework_submissions (homework_id, status);
CREATE INDEX IF NOT EXISTS submissions_membership_idx ON homework_submissions (membership_id, created_at DESC);

DROP TRIGGER IF EXISTS submissions_updated_at ON homework_submissions;
CREATE TRIGGER submissions_updated_at BEFORE UPDATE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Nhất quán tenant ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_homework_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM classes WHERE id = NEW.class_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Lớp không tồn tại: %', NEW.class_id;
  END IF;
  NEW.org_id := v_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS homework_tenant_check ON homework;
CREATE TRIGGER homework_tenant_check
  BEFORE INSERT OR UPDATE ON homework
  FOR EACH ROW EXECUTE FUNCTION enforce_homework_tenant();

CREATE OR REPLACE FUNCTION enforce_submission_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_hw_org  UUID;
  v_mem_org UUID;
BEGIN
  SELECT org_id INTO v_hw_org FROM homework WHERE id = NEW.homework_id;
  SELECT org_id INTO v_mem_org FROM memberships WHERE id = NEW.membership_id;

  IF v_hw_org IS NULL OR v_mem_org IS NULL THEN
    RAISE EXCEPTION 'Bài tập hoặc thành viên không tồn tại';
  END IF;
  IF v_hw_org <> v_mem_org THEN
    RAISE EXCEPTION 'Vi phạm cô lập tenant: bài tập thuộc org % nhưng học viên thuộc org %',
      v_hw_org, v_mem_org;
  END IF;

  NEW.org_id := v_hw_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS submission_tenant_check ON homework_submissions;
CREATE TRIGGER submission_tenant_check
  BEFORE INSERT OR UPDATE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_submission_tenant();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE homework             ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON homework             FROM anon;
REVOKE ALL ON homework_submissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON homework             TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON homework_submissions TO authenticated;

-- Bài tập: staff quản lý; học viên chỉ thấy bài đã published trong lớp mình.
DROP POLICY IF EXISTS homework_select_staff ON homework;
CREATE POLICY homework_select_staff ON homework
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id));

DROP POLICY IF EXISTS homework_select_student ON homework;
CREATE POLICY homework_select_student ON homework
  FOR SELECT TO authenticated
  USING (status IN ('published', 'closed') AND public.in_class(class_id));

DROP POLICY IF EXISTS homework_write_staff ON homework;
CREATE POLICY homework_write_staff ON homework
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- Bài nộp: học viên chỉ thấy và sửa bài CỦA MÌNH.
DROP POLICY IF EXISTS submissions_select_own ON homework_submissions;
CREATE POLICY submissions_select_own ON homework_submissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = homework_submissions.membership_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS submissions_select_staff ON homework_submissions;
CREATE POLICY submissions_select_staff ON homework_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM homework h
      WHERE h.id = homework_submissions.homework_id AND public.teaches_class(h.class_id)
    )
  );

-- Học viên tạo bài nộp của mình
DROP POLICY IF EXISTS submissions_insert_own ON homework_submissions;
CREATE POLICY submissions_insert_own ON homework_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = homework_submissions.membership_id AND m.user_id = auth.uid()
    )
  );

-- Học viên sửa bài của mình khi CHƯA chấm. Sau khi chấm thì không sửa được —
-- nếu không thì sửa lại đáp án sau khi biết điểm.
DROP POLICY IF EXISTS submissions_update_own ON homework_submissions;
CREATE POLICY submissions_update_own ON homework_submissions
  FOR UPDATE TO authenticated
  USING (
    status <> 'graded'
    AND EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = homework_submissions.membership_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = homework_submissions.membership_id AND m.user_id = auth.uid()
    )
  );

-- Giáo viên chấm bài
DROP POLICY IF EXISTS submissions_update_staff ON homework_submissions;
CREATE POLICY submissions_update_staff ON homework_submissions
  FOR UPDATE TO authenticated
  USING (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM homework h
      WHERE h.id = homework_submissions.homework_id AND public.teaches_class(h.class_id)
    )
  )
  WITH CHECK (
    public.is_org_owner(org_id)
    OR EXISTS (
      SELECT 1 FROM homework h
      WHERE h.id = homework_submissions.homework_id AND public.teaches_class(h.class_id)
    )
  );

COMMENT ON TABLE homework IS 'Bài tập có đề, hạn nộp và chấm điểm. Câu hỏi lưu JSONB vì các loại câu hỏi có cấu trúc rất khác nhau. Đáp án phải được lọc bỏ trước khi trả về cho học viên.';
COMMENT ON TABLE homework_submissions IS 'Bài nộp. Học viên không sửa được sau khi đã chấm (chặn ở RLS, không chỉ ở UI).';
