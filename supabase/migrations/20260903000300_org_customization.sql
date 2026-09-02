-- ════════════════════════════════════════════════════════════════════════════
-- 0003 — Ba cơ chế khả biến
--
-- Đây là câu trả lời cho "mỗi trung tâm có nhu cầu hơi khác nhau thì sao?".
-- ~85% yêu cầu khác biệt của khách rơi vào 3 loại dưới đây và được giải bằng
-- DỮ LIỆU, không phải bằng code riêng cho từng khách:
--
--   1. org_settings   — cấu hình (giờ gửi mail, thang điểm, ngưỡng cảnh báo)
--   2. org_features   — bật/tắt tính năng (đồng thời là cơ chế bán gói)
--   3. org_field_defs — trường dữ liệu riêng (mã HV nội bộ, Zalo phụ huynh)
--
-- Làm ngay từ đầu vì thêm sau khi đã có 10 khách thì tốn hàng tháng.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. org_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_settings (
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

DROP TRIGGER IF EXISTS org_settings_updated_at ON org_settings;
CREATE TRIGGER org_settings_updated_at BEFORE UPDATE ON org_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. org_features ─────────────────────────────────────────────────────────
-- Vừa là khả biến, vừa là cơ chế bán gói: Basic tắt speaking_review, Pro bật.
CREATE TABLE IF NOT EXISTS org_features (
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL CHECK (feature_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, feature_key)
);

DROP TRIGGER IF EXISTS org_features_updated_at ON org_features;
CREATE TRIGGER org_features_updated_at BEFORE UPDATE ON org_features
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. org_field_defs ───────────────────────────────────────────────────────
-- Định nghĩa trường riêng; giá trị lưu ở memberships.custom_fields /
-- classes.custom_fields (JSONB). Trung tâm tự thêm trường, không cần deploy.
CREATE TABLE IF NOT EXISTS org_field_defs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity     TEXT NOT NULL CHECK (entity IN ('membership', 'class')),
  field_key  TEXT NOT NULL CHECK (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  label      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('text', 'number', 'date', 'select', 'boolean')),
  options    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- cho type='select'
  required   BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, entity, field_key)
);

CREATE INDEX IF NOT EXISTS org_field_defs_lookup ON org_field_defs (org_id, entity, sort_order);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE org_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_features   ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_field_defs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON org_settings   FROM anon;
REVOKE ALL ON org_features   FROM anon;
REVOKE ALL ON org_field_defs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_settings   TO authenticated;
GRANT SELECT                         ON org_features   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON org_field_defs TO authenticated;

-- Cấu hình: mọi thành viên ĐỌC được (UI cần biết để render), chỉ owner SỬA.
DROP POLICY IF EXISTS org_settings_select_member ON org_settings;
CREATE POLICY org_settings_select_member ON org_settings
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS org_settings_write_owner ON org_settings;
CREATE POLICY org_settings_write_owner ON org_settings
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- Feature flags: thành viên chỉ ĐỌC. Ghi CHỈ qua service role — vì đây là
-- cơ chế bán gói, owner của trung tâm không được tự bật tính năng trả phí.
DROP POLICY IF EXISTS org_features_select_member ON org_features;
CREATE POLICY org_features_select_member ON org_features
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

-- Định nghĩa trường: thành viên đọc, owner sửa.
DROP POLICY IF EXISTS org_field_defs_select_member ON org_field_defs;
CREATE POLICY org_field_defs_select_member ON org_field_defs
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS org_field_defs_write_owner ON org_field_defs;
CREATE POLICY org_field_defs_write_owner ON org_field_defs
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

COMMENT ON TABLE org_settings IS 'Cấu hình theo tổ chức. Mọi code PHẢI đọc qua getOrgSetting() để mặc định nằm một chỗ.';
COMMENT ON TABLE org_features IS 'Feature flags = khả biến + cơ chế bán gói. Ghi chỉ qua service role.';
COMMENT ON TABLE org_field_defs IS 'Định nghĩa trường riêng của trung tâm; giá trị nằm trong *.custom_fields JSONB.';
