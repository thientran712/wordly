-- ════════════════════════════════════════════════════════════════════════════
-- 0001 — Organizations & Memberships: nền tảng multi-tenant
--
-- Quyết định kiến trúc (xem docs/superpowers/specs/2026-09-03-...):
--   • Shared DB + shared schema, cô lập bằng RLS theo org_id
--   • Ngữ cảnh org nằm trong JWT (custom access token hook) để RLS không
--     phải query bảng — tránh vừa chậm vừa đệ quy vô hạn
--   • memberships là bảng trung tâm (KHÔNG phải "students"), vì một người
--     có thể thuộc nhiều org với nhiều vai trò khác nhau
--
-- Idempotent: an toàn khi chạy lại.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enum vai trò ────────────────────────────────────────────────────────────
-- 'parent' có ngay từ đầu dù báo cáo phụ huynh ở GĐ3: thêm giá trị enum bây
-- giờ là miễn phí, sửa mô hình quyền sau khi có dữ liệu thật thì rất đắt.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    CREATE TYPE org_role AS ENUM ('owner', 'teacher', 'student', 'parent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_status') THEN
    CREATE TYPE membership_status AS ENUM ('active', 'invited', 'removed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_status') THEN
    CREATE TYPE org_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
  END IF;
END $$;

-- ── organizations ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  plan          TEXT NOT NULL DEFAULT 'basic',
  status        org_status NOT NULL DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── memberships ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  -- invited_email: cho phép mời người CHƯA có tài khoản. Khi họ đăng ký và
  -- nhận lời mời, user_id được gắn vào. Vì vậy user_id nullable.
  invited_email TEXT CHECK (invited_email IS NULL OR invited_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          org_role NOT NULL DEFAULT 'student',
  status        membership_status NOT NULL DEFAULT 'active',
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  invited_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Một membership phải gắn với user HOẶC email được mời, không thể thiếu cả hai
  CONSTRAINT memberships_identity_check
    CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);

-- Một user chỉ có MỘT membership trong mỗi org (vai trò nằm trong hàng đó).
CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_user_uniq
  ON memberships (org_id, user_id) WHERE user_id IS NOT NULL;

-- Không mời trùng cùng một email vào cùng một org khi lời mời còn treo.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_org_invite_uniq
  ON memberships (org_id, lower(invited_email))
  WHERE invited_email IS NOT NULL AND user_id IS NULL;

CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_org_role_idx ON memberships (org_id, role, status);

-- ── updated_at tự động ──────────────────────────────────────────────────────
-- Codebase hiện KHÔNG có trigger nào và dựa vào app tự set updated_at. Với
-- multi-tenant thì để DB tự lo an toàn hơn — không phụ thuộc kỷ luật code.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_updated_at ON organizations;
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS memberships_updated_at ON memberships;
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- JWT: nhúng ngữ cảnh org vào access token
--
-- Vì sao cần: RLS phải biết "user này thuộc org nào, vai trò gì" trong MỌI
-- query. Nếu mỗi policy tự SELECT vào memberships thì (a) chậm, và (b) policy
-- của memberships tham chiếu chính nó → đệ quy vô hạn.
--
-- Hook chạy lúc phát token, ghi claim:
--   "user_orgs": { "<org_id>": "teacher", "<org_id2>": "student" }
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  claims     jsonb;
  orgs_map   jsonb;
  uid        uuid;
BEGIN
  uid := (event->>'user_id')::uuid;

  SELECT COALESCE(jsonb_object_agg(m.org_id::text, m.role::text), '{}'::jsonb)
    INTO orgs_map
  FROM memberships m
  JOIN organizations o ON o.id = m.org_id
  WHERE m.user_id = uid
    AND m.status = 'active'
    AND o.status IN ('trial', 'active');

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_orgs}', orgs_map);

  RETURN jsonb_set(event, '{claims}', claims);
END $$;

-- Chỉ Supabase Auth được gọi hook này.
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
    GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
    -- Hook cần đọc được membership để dựng claim
    GRANT SELECT ON TABLE memberships, organizations TO supabase_auth_admin;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Hàm đọc ngữ cảnh org từ JWT — nền của mọi RLS policy
-- ════════════════════════════════════════════════════════════════════════════

-- Vai trò của user hiện tại trong org, đọc TỪ JWT (không query bảng).
CREATE OR REPLACE FUNCTION public.jwt_org_role(target_org uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_orgs' ->> target_org::text,
    NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_org_role(target_org) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_org_role(target_org) = 'owner';
$$;

-- "Staff" = owner hoặc teacher: người có quyền quản lý lớp/tài liệu.
CREATE OR REPLACE FUNCTION public.is_org_staff(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_org_role(target_org) IN ('owner', 'teacher');
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships   ENABLE ROW LEVEL SECURITY;

-- Chặn mọi thứ với anon; chỉ authenticated đi qua policy.
REVOKE ALL ON organizations FROM anon;
REVOKE ALL ON memberships   FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships   TO authenticated;

-- ── organizations ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS organizations_select_member ON organizations;
CREATE POLICY organizations_select_member ON organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS organizations_update_owner ON organizations;
CREATE POLICY organizations_update_owner ON organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

-- Tạo/xoá org KHÔNG mở cho người dùng: chỉ super-admin qua service role.
-- Lý do: onboarding trung tâm là quy trình bán hàng có kiểm soát, không
-- phải self-service — tránh spam org và giữ đúng mô hình kinh doanh.

-- ── memberships ─────────────────────────────────────────────────────────────

-- Ai cũng đọc được membership CỦA CHÍNH MÌNH (cần cho việc liệt kê org của tôi).
DROP POLICY IF EXISTS memberships_select_self ON memberships;
CREATE POLICY memberships_select_self ON memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Staff đọc được membership trong org của họ (để quản lý lớp, xem danh sách HV).
DROP POLICY IF EXISTS memberships_select_staff ON memberships;
CREATE POLICY memberships_select_staff ON memberships
  FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));

-- Chỉ owner mời/thêm thành viên. WITH CHECK chặn việc chèn hàng sang org khác.
DROP POLICY IF EXISTS memberships_insert_owner ON memberships;
CREATE POLICY memberships_insert_owner ON memberships
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner(org_id));

DROP POLICY IF EXISTS memberships_update_owner ON memberships;
CREATE POLICY memberships_update_owner ON memberships
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

DROP POLICY IF EXISTS memberships_delete_owner ON memberships;
CREATE POLICY memberships_delete_owner ON memberships
  FOR DELETE TO authenticated
  USING (public.is_org_owner(org_id));

-- Người dùng tự nhận lời mời: chuyển invited → active cho CHÍNH MÌNH.
-- Chỉ áp dụng cho hàng đang treo (user_id IS NULL) và email khớp với email
-- trong JWT — không cho phép nhận lời mời của người khác.
DROP POLICY IF EXISTS memberships_accept_invite ON memberships;
CREATE POLICY memberships_accept_invite ON memberships
  FOR UPDATE TO authenticated
  USING (
    user_id IS NULL
    AND status = 'invited'
    AND lower(invited_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'active'
  );

COMMENT ON TABLE organizations IS 'Trung tâm Anh ngữ — đơn vị tenant. Tạo/xoá chỉ qua service role (quy trình bán hàng có kiểm soát).';
COMMENT ON TABLE memberships IS 'Quan hệ người ↔ tổ chức + vai trò. Một người có thể thuộc nhiều org. Nguồn dữ liệu cho claim user_orgs trong JWT.';
COMMENT ON FUNCTION public.custom_access_token_hook(jsonb) IS 'Nhúng { org_id: role } vào JWT claim user_orgs để RLS không phải query bảng. Cấu hình tại Supabase Dashboard → Auth → Hooks.';
