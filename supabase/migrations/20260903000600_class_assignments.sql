-- ════════════════════════════════════════════════════════════════════════════
-- 0006 — Giao bộ từ vựng cho lớp
--
-- Điểm mạnh: KHÔNG cần xây gì mới cho phần phân phối. Bộ từ được giao chỉ là
-- nguồn nạp vào hàng đợi ôn tập mà select-word-for-email.js đã xử lý sẵn.
-- Đây là lý do module này nằm ở GĐ1: chi phí thấp, giá trị cao.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS class_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES class_sessions(id) ON DELETE SET NULL,

  title       TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),

  -- Tiêu chí chọn từ từ kho 7.5k sẵn có (words + word_layers).
  -- Lưu tiêu chí thay vì danh sách từ cố định: HV vào lớp muộn vẫn nhận đúng
  -- bộ từ, và GV sửa tiêu chí là cả lớp cập nhật theo.
  filter_level  TEXT CHECK (filter_level IS NULL OR filter_level IN ('A1','A2','B1','B2','C1','C2')),
  filter_topic  TEXT,
  -- Danh sách word_id chỉ định thủ công (nếu GV tự chọn từng từ)
  explicit_word_ids UUID[] NOT NULL DEFAULT '{}',

  daily_count INTEGER NOT NULL DEFAULT 5 CHECK (daily_count BETWEEN 1 AND 50),
  start_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date    DATE,

  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT class_assignments_date_order CHECK (end_date IS NULL OR end_date >= start_date),
  -- Phải có ít nhất một cách chọn từ
  CONSTRAINT class_assignments_source_check CHECK (
    filter_level IS NOT NULL
    OR filter_topic IS NOT NULL
    OR array_length(explicit_word_ids, 1) > 0
  )
);

CREATE INDEX IF NOT EXISTS class_assignments_class_idx ON class_assignments (class_id, start_date DESC);
CREATE INDEX IF NOT EXISTS class_assignments_org_idx ON class_assignments (org_id);

DROP TRIGGER IF EXISTS class_assignments_updated_at ON class_assignments;
CREATE TRIGGER class_assignments_updated_at BEFORE UPDATE ON class_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Nhất quán tenant
CREATE OR REPLACE FUNCTION enforce_assignment_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_class_org UUID;
BEGIN
  SELECT org_id INTO v_class_org FROM classes WHERE id = NEW.class_id;
  IF v_class_org IS NULL THEN
    RAISE EXCEPTION 'Lớp không tồn tại: %', NEW.class_id;
  END IF;
  NEW.org_id := v_class_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS class_assignments_tenant_check ON class_assignments;
CREATE TRIGGER class_assignments_tenant_check
  BEFORE INSERT OR UPDATE ON class_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_assignment_tenant();

-- ── Theo dõi việc đã nạp từ cho HV nào ──────────────────────────────────────
-- Bảng này bảo đảm idempotency: job nạp từ chạy lại không nạp trùng.
CREATE TABLE IF NOT EXISTS assignment_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  word_id       UUID NOT NULL,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (assignment_id, membership_id, word_id)
);

CREATE INDEX IF NOT EXISTS assignment_deliveries_lookup
  ON assignment_deliveries (assignment_id, membership_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE class_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON class_assignments     FROM anon;
REVOKE ALL ON assignment_deliveries FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_assignments TO authenticated;
GRANT SELECT ON assignment_deliveries TO authenticated;

-- Staff quản lý bài giao; HV xem được bài giao của lớp mình.
DROP POLICY IF EXISTS class_assignments_select_staff ON class_assignments;
CREATE POLICY class_assignments_select_staff ON class_assignments
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id));

DROP POLICY IF EXISTS class_assignments_select_student ON class_assignments;
CREATE POLICY class_assignments_select_student ON class_assignments
  FOR SELECT TO authenticated
  USING (public.in_class(class_id));

DROP POLICY IF EXISTS class_assignments_write_staff ON class_assignments;
CREATE POLICY class_assignments_write_staff ON class_assignments
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- HV xem được lịch sử nạp từ của chính mình.
DROP POLICY IF EXISTS assignment_deliveries_select_self ON assignment_deliveries;
CREATE POLICY assignment_deliveries_select_self ON assignment_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = assignment_deliveries.membership_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE class_assignments IS 'Bộ từ GV giao cho lớp. Lưu TIÊU CHÍ chọn từ (không phải danh sách cố định) để HV vào muộn vẫn nhận đúng bộ.';
COMMENT ON TABLE assignment_deliveries IS 'Chống nạp trùng: job nạp từ chạy lại không nạp lại từ đã nạp.';
