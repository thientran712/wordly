-- ════════════════════════════════════════════════════════════════════════════
-- 0005 — Thư viện bài giảng: buổi học, tài liệu, quota lưu trữ
--
-- Phạm vi GĐ1: tài liệu (PDF/PPT/Word/ảnh) + audio + link ngoài.
-- Hoãn GĐ2: video upload trực tiếp (cần Cloudflare Stream/Mux để transcode
-- + streaming). Cột kind='video' và provider đã có sẵn nên thêm video sau
-- KHÔNG cần migration.
--
-- Lưu trữ là chi phí biến đổi LỚN NHẤT của hệ thống (vượt cả AI), nên quota
-- được thiết kế ngay từ đầu — vừa kiểm soát chi phí, vừa là đòn bẩy bán gói.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_kind') THEN
    CREATE TYPE material_kind AS ENUM ('document', 'audio', 'video', 'link');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'session_status') THEN
    CREATE TYPE session_status AS ENUM ('draft', 'published');
  END IF;
END $$;

-- ── class_sessions ──────────────────────────────────────────────────────────
-- Buổi học là đơn vị tổ chức nội dung. Trung tâm dạy theo buổi — GV cần
-- "Buổi 5: Present Perfect" chứa slide + audio, không phải 60 file rời.
CREATE TABLE IF NOT EXISTS class_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  notes        TEXT,
  session_date DATE,
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       session_status NOT NULL DEFAULT 'draft',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS class_sessions_class_idx
  ON class_sessions (class_id, order_index, session_date);
CREATE INDEX IF NOT EXISTS class_sessions_org_idx ON class_sessions (org_id);

DROP TRIGGER IF EXISTS class_sessions_updated_at ON class_sessions;
CREATE TRIGGER class_sessions_updated_at BEFORE UPDATE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── lesson_materials ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  kind          material_kind NOT NULL,
  title         TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  description   TEXT,

  -- File upload: đường dẫn trong Supabase Storage, dạng
  -- {org_id}/{class_id}/{session_id}/{uuid}-{filename}
  -- org_id ở ĐẦU đường dẫn là điều kiện để Storage RLS hoạt động.
  storage_path  TEXT,
  mime_type     TEXT,
  size_bytes    BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),

  -- Link ngoài (YouTube/Drive) — chi phí lưu trữ = 0
  external_url  TEXT CHECK (external_url IS NULL OR external_url ~* '^https?://'),

  -- Dành cho video GĐ2: 'cloudflare' | 'mux' | NULL
  provider      TEXT,
  provider_id   TEXT,

  allow_download BOOLEAN NOT NULL DEFAULT true,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Mỗi tài liệu là file HOẶC link, không thể vừa thiếu cả hai vừa có cả hai
  CONSTRAINT lesson_materials_source_check CHECK (
    (kind = 'link' AND external_url IS NOT NULL AND storage_path IS NULL)
    OR (kind IN ('document', 'audio') AND storage_path IS NOT NULL AND external_url IS NULL)
    OR (kind = 'video' AND (storage_path IS NOT NULL OR external_url IS NOT NULL OR provider_id IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS lesson_materials_session_idx ON lesson_materials (session_id, created_at);
CREATE INDEX IF NOT EXISTS lesson_materials_org_idx ON lesson_materials (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS lesson_materials_storage_path_uniq
  ON lesson_materials (storage_path) WHERE storage_path IS NOT NULL;

-- ── Nhất quán tenant cho session & material ─────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_session_tenant()
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
  NEW.org_id := v_class_org;  -- không tin org_id client gửi
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS class_sessions_tenant_check ON class_sessions;
CREATE TRIGGER class_sessions_tenant_check
  BEFORE INSERT OR UPDATE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION enforce_session_tenant();

CREATE OR REPLACE FUNCTION enforce_material_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session class_sessions;
BEGIN
  SELECT * INTO v_session FROM class_sessions WHERE id = NEW.session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Buổi học không tồn tại: %', NEW.session_id;
  END IF;
  -- Suy ra class_id/org_id từ session, không tin client
  NEW.class_id := v_session.class_id;
  NEW.org_id   := v_session.org_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lesson_materials_tenant_check ON lesson_materials;
CREATE TRIGGER lesson_materials_tenant_check
  BEFORE INSERT OR UPDATE ON lesson_materials
  FOR EACH ROW EXECUTE FUNCTION enforce_material_tenant();

-- ── org_storage_usage: quota ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_storage_usage (
  org_id      UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  bytes_used  BIGINT NOT NULL DEFAULT 0 CHECK (bytes_used >= 0),
  bytes_limit BIGINT NOT NULL DEFAULT 5368709120,  -- 5GB mặc định (gói Basic)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS org_storage_usage_updated_at ON org_storage_usage;
CREATE TRIGGER org_storage_usage_updated_at BEFORE UPDATE ON org_storage_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tự cập nhật bytes_used khi thêm/xoá tài liệu.
-- Đặt ở DB thay vì app: xoá file mà quên trừ quota là rò rỉ chi phí, và
-- trigger bảo đảm không bao giờ lệch bất kể route nào thao tác.
CREATE OR REPLACE FUNCTION track_storage_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.size_bytes IS NOT NULL THEN
    INSERT INTO org_storage_usage (org_id, bytes_used)
    VALUES (NEW.org_id, NEW.size_bytes)
    ON CONFLICT (org_id) DO UPDATE
      SET bytes_used = org_storage_usage.bytes_used + NEW.size_bytes;
  ELSIF TG_OP = 'DELETE' AND OLD.size_bytes IS NOT NULL THEN
    UPDATE org_storage_usage
      SET bytes_used = GREATEST(0, bytes_used - OLD.size_bytes)
      WHERE org_id = OLD.org_id;
  END IF;
  RETURN NULL;  -- AFTER trigger
END $$;

DROP TRIGGER IF EXISTS lesson_materials_storage_tracking ON lesson_materials;
CREATE TRIGGER lesson_materials_storage_tracking
  AFTER INSERT OR DELETE ON lesson_materials
  FOR EACH ROW EXECUTE FUNCTION track_storage_usage();

-- Kiểm quota trước khi phát signed upload URL.
CREATE OR REPLACE FUNCTION public.check_storage_quota(p_org_id uuid, p_bytes bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_usage org_storage_usage;
BEGIN
  SELECT * INTO v_usage FROM org_storage_usage WHERE org_id = p_org_id;

  -- Org chưa có hàng usage → dùng mặc định 5GB
  IF v_usage.org_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', p_bytes <= 5368709120,
      'bytes_used', 0,
      'bytes_limit', 5368709120
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', (v_usage.bytes_used + p_bytes) <= v_usage.bytes_limit,
    'bytes_used', v_usage.bytes_used,
    'bytes_limit', v_usage.bytes_limit
  );
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE class_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_materials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_storage_usage  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON class_sessions    FROM anon;
REVOKE ALL ON lesson_materials  FROM anon;
REVOKE ALL ON org_storage_usage FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON class_sessions   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_materials TO authenticated;
GRANT SELECT                         ON org_storage_usage TO authenticated;

-- Buổi học: staff thấy tất cả (kể cả draft); HV chỉ thấy bài đã published.
DROP POLICY IF EXISTS class_sessions_select_staff ON class_sessions;
CREATE POLICY class_sessions_select_staff ON class_sessions
  FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id) AND (public.is_org_owner(org_id) OR public.teaches_class(class_id)));

DROP POLICY IF EXISTS class_sessions_select_student ON class_sessions;
CREATE POLICY class_sessions_select_student ON class_sessions
  FOR SELECT TO authenticated
  USING (status = 'published' AND public.in_class(class_id));

DROP POLICY IF EXISTS class_sessions_write_staff ON class_sessions;
CREATE POLICY class_sessions_write_staff ON class_sessions
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- Tài liệu: thành viên lớp đọc được nếu buổi học đã published; staff đọc hết.
DROP POLICY IF EXISTS lesson_materials_select_staff ON lesson_materials;
CREATE POLICY lesson_materials_select_staff ON lesson_materials
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id));

DROP POLICY IF EXISTS lesson_materials_select_student ON lesson_materials;
CREATE POLICY lesson_materials_select_student ON lesson_materials
  FOR SELECT TO authenticated
  USING (
    public.in_class(class_id)
    AND EXISTS (
      SELECT 1 FROM class_sessions cs
      WHERE cs.id = lesson_materials.session_id AND cs.status = 'published'
    )
  );

DROP POLICY IF EXISTS lesson_materials_write_staff ON lesson_materials;
CREATE POLICY lesson_materials_write_staff ON lesson_materials
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id) OR public.teaches_class(class_id))
  WITH CHECK (public.is_org_owner(org_id) OR public.teaches_class(class_id));

-- Quota: thành viên xem được mức dùng (UI cần hiển thị), chỉ service role sửa.
DROP POLICY IF EXISTS org_storage_usage_select ON org_storage_usage;
CREATE POLICY org_storage_usage_select ON org_storage_usage
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- ════════════════════════════════════════════════════════════════════════════
-- Supabase Storage: bucket private + RLS theo org_id trong đường dẫn
--
-- Bucket PRIVATE là bắt buộc: nếu public thì tài liệu của trung tâm A ai có
-- link cũng xem được — không chấp nhận được với B2B.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-materials',
  'lesson-materials',
  false,
  104857600,  -- 100MB (audio); tài liệu bị chặn 50MB ở tầng ứng dụng
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Đoạn đầu đường dẫn là org_id → so trực tiếp với JWT.
-- storage.foldername(name) trả về mảng các đoạn của đường dẫn.
DROP POLICY IF EXISTS lesson_materials_storage_read ON storage.objects;
CREATE POLICY lesson_materials_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lesson-materials'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS lesson_materials_storage_write ON storage.objects;
CREATE POLICY lesson_materials_storage_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-materials'
    AND public.is_org_staff(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS lesson_materials_storage_delete ON storage.objects;
CREATE POLICY lesson_materials_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lesson-materials'
    AND public.is_org_staff(((storage.foldername(name))[1])::uuid)
  );

COMMENT ON TABLE class_sessions IS 'Buổi học — đơn vị tổ chức nội dung. HV chỉ thấy status=published.';
COMMENT ON TABLE lesson_materials IS 'Tài liệu bài giảng. kind=video + provider để sẵn cho GĐ2, không cần migration thêm.';
COMMENT ON TABLE org_storage_usage IS 'Quota lưu trữ. bytes_used tự cập nhật bằng trigger để không bao giờ lệch.';
