-- ════════════════════════════════════════════════════════════════════════════
-- GĐ3 — Quan hệ phụ huynh ↔ học viên
--
-- Trước đây job báo cáo gửi theo `memberships.role`, nên một phụ huynh không
-- theo được nhiều con và một học viên không có nhiều người nhận báo cáo.
-- Bảng này giải quyết cả hai: quan hệ nhiều-nhiều.
--
-- Nghiệp vụ thật ở trung tâm Anh ngữ Việt Nam:
--   • Một phụ huynh thường có 2-3 con cùng học
--   • Một học viên có thể có cả bố lẫn mẹ nhận báo cáo
--   • Học viên người lớn tự học thì KHÔNG có phụ huynh
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guardian_relationship') THEN
    CREATE TYPE guardian_relationship AS ENUM (
      'father', 'mother', 'grandparent', 'sibling', 'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS guardian_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Cả hai đều là membership trong CÙNG org (trigger bảo đảm)
  guardian_membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  student_membership_id  UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,

  relationship  guardian_relationship NOT NULL DEFAULT 'other',

  -- Phụ huynh có thể tắt nhận báo cáo mà không cần xoá liên kết
  receive_reports BOOLEAN NOT NULL DEFAULT true,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Không liên kết trùng
  UNIQUE (guardian_membership_id, student_membership_id),

  -- Không tự làm phụ huynh của chính mình: vô nghĩa, và có thể dùng để lách
  -- quyền (tự cấp quyền xem dữ liệu qua đường phụ huynh)
  CONSTRAINT guardian_not_self CHECK (guardian_membership_id <> student_membership_id)
);

CREATE INDEX IF NOT EXISTS guardian_links_student_idx
  ON guardian_links (student_membership_id) WHERE receive_reports;
CREATE INDEX IF NOT EXISTS guardian_links_guardian_idx
  ON guardian_links (guardian_membership_id);
CREATE INDEX IF NOT EXISTS guardian_links_org_idx ON guardian_links (org_id);

DROP TRIGGER IF EXISTS guardian_links_updated_at ON guardian_links;
CREATE TRIGGER guardian_links_updated_at BEFORE UPDATE ON guardian_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Nhất quán tenant ────────────────────────────────────────────────────────
-- Chặn ghép phụ huynh org A với học viên org B. RLS một mình không bắt được
-- vì cả hai hàng đều hợp lệ riêng lẻ.
CREATE OR REPLACE FUNCTION enforce_guardian_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_guardian_org UUID;
  v_student_org  UUID;
BEGIN
  SELECT org_id INTO v_guardian_org FROM memberships WHERE id = NEW.guardian_membership_id;
  SELECT org_id INTO v_student_org  FROM memberships WHERE id = NEW.student_membership_id;

  IF v_guardian_org IS NULL OR v_student_org IS NULL THEN
    RAISE EXCEPTION 'Phụ huynh hoặc học viên không tồn tại';
  END IF;
  IF v_guardian_org <> v_student_org THEN
    RAISE EXCEPTION 'Vi phạm cô lập tenant: phụ huynh thuộc org % nhưng học viên thuộc org %',
      v_guardian_org, v_student_org;
  END IF;

  NEW.org_id := v_student_org;  -- không tin org_id client gửi
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guardian_links_tenant_check ON guardian_links;
CREATE TRIGGER guardian_links_tenant_check
  BEFORE INSERT OR UPDATE ON guardian_links
  FOR EACH ROW EXECUTE FUNCTION enforce_guardian_tenant();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE guardian_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON guardian_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON guardian_links TO authenticated;

-- Owner quản lý toàn bộ liên kết trong org
DROP POLICY IF EXISTS guardian_links_owner ON guardian_links;
CREATE POLICY guardian_links_owner ON guardian_links
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- Giáo viên XEM được liên kết của học viên lớp mình dạy (để biết liên hệ ai)
DROP POLICY IF EXISTS guardian_links_select_teacher ON guardian_links;
CREATE POLICY guardian_links_select_teacher ON guardian_links
  FOR SELECT TO authenticated
  USING (
    public.is_org_staff(org_id)
    AND EXISTS (
      SELECT 1
      FROM class_members target_cm
      JOIN class_members my_cm ON my_cm.class_id = target_cm.class_id
      JOIN memberships my_m ON my_m.id = my_cm.membership_id
      WHERE target_cm.membership_id = guardian_links.student_membership_id
        AND my_m.user_id = auth.uid()
        AND my_cm.role_in_class IN ('teacher', 'assistant')
    )
  );

-- Phụ huynh xem được liên kết CỦA MÌNH (biết mình đang theo con nào)
DROP POLICY IF EXISTS guardian_links_select_guardian ON guardian_links;
CREATE POLICY guardian_links_select_guardian ON guardian_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = guardian_links.guardian_membership_id AND m.user_id = auth.uid()
    )
  );

-- Phụ huynh tự bật/tắt nhận báo cáo cho liên kết của mình.
-- CHỈ được đổi receive_reports — không đổi được quan hệ hay học viên.
DROP POLICY IF EXISTS guardian_links_toggle_own ON guardian_links;
CREATE POLICY guardian_links_toggle_own ON guardian_links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = guardian_links.guardian_membership_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = guardian_links.guardian_membership_id AND m.user_id = auth.uid()
    )
  );

-- Học viên xem được ai đang nhận báo cáo về mình (minh bạch quyền riêng tư)
DROP POLICY IF EXISTS guardian_links_select_student ON guardian_links;
CREATE POLICY guardian_links_select_student ON guardian_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = guardian_links.student_membership_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE guardian_links IS 'Quan hệ phụ huynh ↔ học viên (nhiều-nhiều). Một phụ huynh theo nhiều con, một học viên có nhiều người nhận báo cáo. Quyết định ai nhận email báo cáo học tập.';
