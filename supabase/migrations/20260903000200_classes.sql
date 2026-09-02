-- ════════════════════════════════════════════════════════════════════════════
-- 0002 — Classes & Class Members
--
-- Một học viên có thể học NHIỀU lớp (yêu cầu nghiệp vụ rõ ràng từ chủ dự án).
-- class_members trỏ tới memberships (không trỏ thẳng auth.users) để mọi thứ
-- trong lớp luôn nằm trong phạm vi một org — không thể thêm người ngoài org
-- vào lớp của org đó.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_status') THEN
    CREATE TYPE class_status AS ENUM ('active', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_member_role') THEN
    CREATE TYPE class_member_role AS ENUM ('teacher', 'assistant', 'student');
  END IF;
END $$;

-- ── classes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description   TEXT,
  -- Giáo viên phụ trách chính. SET NULL khi GV rời trung tâm để không mất lớp.
  teacher_membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  status        class_status NOT NULL DEFAULT 'active',

  -- ── Mã lớp: có hạn + giới hạn lượt dùng ───────────────────────────────────
  -- Không có hai giới hạn này thì mã lan ra ngoài là người lạ vào lớp được.
  join_code             TEXT UNIQUE CHECK (join_code IS NULL OR join_code ~ '^[A-Z0-9]{4,12}$'),
  join_code_expires_at  TIMESTAMPTZ,
  join_code_max_uses    INTEGER NOT NULL DEFAULT 50 CHECK (join_code_max_uses BETWEEN 1 AND 1000),
  join_code_uses        INTEGER NOT NULL DEFAULT 0 CHECK (join_code_uses >= 0),

  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classes_org_idx ON classes (org_id, status);
CREATE INDEX IF NOT EXISTS classes_teacher_idx ON classes (teacher_membership_id) WHERE teacher_membership_id IS NOT NULL;

DROP TRIGGER IF EXISTS classes_updated_at ON classes;
CREATE TRIGGER classes_updated_at BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── class_members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  -- org_id lặp lại có chủ đích (denormalize): RLS đọc trực tiếp không cần join,
  -- giữ policy đơn giản và nhanh. Trigger dưới đây bảo đảm nó luôn nhất quán.
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_in_class class_member_role NOT NULL DEFAULT 'student',
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (class_id, membership_id)
);

CREATE INDEX IF NOT EXISTS class_members_class_idx ON class_members (class_id, role_in_class);
CREATE INDEX IF NOT EXISTS class_members_membership_idx ON class_members (membership_id);
CREATE INDEX IF NOT EXISTS class_members_org_idx ON class_members (org_id);

-- ── Bảo toàn tính nhất quán tenant ──────────────────────────────────────────
-- Chặn ở tầng DB việc ghép một membership của org A vào lớp của org B.
-- Đây là loại lỗi mà RLS một mình không bắt được (cả hai hàng đều "hợp lệ"
-- riêng lẻ), nên cần trigger kiểm tra quan hệ.
CREATE OR REPLACE FUNCTION enforce_class_member_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  class_org      UUID;
  membership_org UUID;
BEGIN
  SELECT org_id INTO class_org FROM classes WHERE id = NEW.class_id;
  SELECT org_id INTO membership_org FROM memberships WHERE id = NEW.membership_id;

  IF class_org IS NULL THEN
    RAISE EXCEPTION 'Lớp không tồn tại: %', NEW.class_id;
  END IF;
  IF membership_org IS NULL THEN
    RAISE EXCEPTION 'Membership không tồn tại: %', NEW.membership_id;
  END IF;
  IF class_org <> membership_org THEN
    RAISE EXCEPTION 'Vi phạm cô lập tenant: lớp thuộc org % nhưng membership thuộc org %',
      class_org, membership_org;
  END IF;

  -- Luôn tự điền org_id đúng, không tin giá trị client gửi lên.
  NEW.org_id := class_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS class_members_tenant_check ON class_members;
CREATE TRIGGER class_members_tenant_check
  BEFORE INSERT OR UPDATE ON class_members
  FOR EACH ROW EXECUTE FUNCTION enforce_class_member_tenant();

-- ── Hàm hỗ trợ RLS ──────────────────────────────────────────────────────────

-- User hiện tại có dạy lớp này? (dùng cho phạm vi "lớp mình dạy")
CREATE OR REPLACE FUNCTION public.teaches_class(target_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_members cm
    JOIN memberships m ON m.id = cm.membership_id
    WHERE cm.class_id = target_class
      AND m.user_id = auth.uid()
      AND cm.role_in_class IN ('teacher', 'assistant')
  );
$$;

-- User hiện tại có ở trong lớp này? (bất kể vai trò — dùng cho xem tài liệu)
CREATE OR REPLACE FUNCTION public.in_class(target_class uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM class_members cm
    JOIN memberships m ON m.id = cm.membership_id
    WHERE cm.class_id = target_class
      AND m.user_id = auth.uid()
  );
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE classes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON classes       FROM anon;
REVOKE ALL ON class_members FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON classes       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_members TO authenticated;

-- classes: staff thấy mọi lớp trong org; HV/phụ huynh chỉ thấy lớp mình ở trong.
DROP POLICY IF EXISTS classes_select_staff ON classes;
CREATE POLICY classes_select_staff ON classes
  FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));

DROP POLICY IF EXISTS classes_select_member ON classes;
CREATE POLICY classes_select_member ON classes
  FOR SELECT TO authenticated
  USING (public.in_class(id));

-- Tạo lớp: owner hoặc teacher trong org.
DROP POLICY IF EXISTS classes_insert_staff ON classes;
CREATE POLICY classes_insert_staff ON classes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_staff(org_id));

-- Sửa lớp: owner sửa mọi lớp; teacher chỉ lớp mình dạy.
DROP POLICY IF EXISTS classes_update_staff ON classes;
CREATE POLICY classes_update_staff ON classes
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(org_id) OR (public.is_org_staff(org_id) AND public.teaches_class(id)))
  WITH CHECK (public.is_org_owner(org_id) OR (public.is_org_staff(org_id) AND public.teaches_class(id)));

-- Xoá lớp: chỉ owner (hành động khó hồi phục).
DROP POLICY IF EXISTS classes_delete_owner ON classes;
CREATE POLICY classes_delete_owner ON classes
  FOR DELETE TO authenticated
  USING (public.is_org_owner(org_id));

-- class_members: thấy thành viên lớp nếu là staff của org, hoặc ở trong lớp đó.
DROP POLICY IF EXISTS class_members_select ON class_members;
CREATE POLICY class_members_select ON class_members
  FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id) OR public.in_class(class_id));

-- Thêm/xoá thành viên lớp: owner, hoặc teacher của chính lớp đó.
DROP POLICY IF EXISTS class_members_insert_staff ON class_members;
CREATE POLICY class_members_insert_staff ON class_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

DROP POLICY IF EXISTS class_members_delete_staff ON class_members;
CREATE POLICY class_members_delete_staff ON class_members
  FOR DELETE TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- ════════════════════════════════════════════════════════════════════════════
-- Tham gia lớp bằng mã — chạy trong 1 hàm SECURITY DEFINER
--
-- Vì sao dùng hàm thay vì để client INSERT: cần kiểm mã còn hạn, còn lượt,
-- tăng bộ đếm, tạo membership nếu chưa có, và thêm vào lớp — tất cả PHẢI
-- nguyên tử (atomic). Nếu chia nhiều bước từ client thì có khe hở race.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.join_class_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_class      classes;
  v_uid        uuid := auth.uid();
  v_membership memberships;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Khoá hàng lớp để bộ đếm lượt dùng không bị race khi cả lớp nhập cùng lúc.
  SELECT * INTO v_class
  FROM classes
  WHERE join_code = upper(trim(p_code))
    AND status = 'active'
  FOR UPDATE;

  IF v_class.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  IF v_class.join_code_expires_at IS NOT NULL AND v_class.join_code_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_expired');
  END IF;

  IF v_class.join_code_uses >= v_class.join_code_max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'code_exhausted');
  END IF;

  -- Tìm membership sẵn có trong org, hoặc tạo mới với vai trò student.
  SELECT * INTO v_membership
  FROM memberships
  WHERE org_id = v_class.org_id AND user_id = v_uid;

  IF v_membership.id IS NULL THEN
    INSERT INTO memberships (org_id, user_id, role, status)
    VALUES (v_class.org_id, v_uid, 'student', 'active')
    RETURNING * INTO v_membership;
  ELSIF v_membership.status = 'removed' THEN
    -- Người từng bị xoá khỏi org không tự quay lại bằng mã lớp.
    RETURN jsonb_build_object('ok', false, 'error', 'membership_removed');
  END IF;

  -- Thêm vào lớp (không lỗi nếu đã ở trong lớp).
  INSERT INTO class_members (class_id, membership_id, org_id, role_in_class)
  VALUES (v_class.id, v_membership.id, v_class.org_id, 'student')
  ON CONFLICT (class_id, membership_id) DO NOTHING;

  -- Chỉ tăng bộ đếm khi thực sự có người mới vào lớp.
  IF FOUND THEN
    UPDATE classes SET join_code_uses = join_code_uses + 1 WHERE id = v_class.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'org_id', v_class.org_id,
    'class_id', v_class.id,
    'class_name', v_class.name,
    -- Client PHẢI refreshSession() sau đó: org context nằm trong JWT nên
    -- token hiện tại chưa có org mới này.
    'needs_session_refresh', true
  );
END $$;

REVOKE ALL ON FUNCTION public.join_class_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_class_by_code(text) TO authenticated;

COMMENT ON TABLE classes IS 'Lớp học trong một trung tâm. Mã lớp có hạn dùng và giới hạn lượt để không lan ra ngoài.';
COMMENT ON TABLE class_members IS 'Học viên/GV trong lớp. org_id denormalize để RLS nhanh; trigger bảo đảm nhất quán tenant.';
COMMENT ON FUNCTION public.join_class_by_code(text) IS 'Tham gia lớp bằng mã, nguyên tử: kiểm hạn + lượt, tạo membership nếu cần, tăng bộ đếm.';
