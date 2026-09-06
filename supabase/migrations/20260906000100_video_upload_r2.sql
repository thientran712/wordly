-- ════════════════════════════════════════════════════════════════════════════
-- GĐ2 — Video upload trực tiếp qua Cloudflare R2
--
-- Trước đây hoãn vì "cần Cloudflare Stream/Mux để transcode + streaming"
-- (xem comment ở 20260903000500). Quyết định lại: KHÔNG transcode, chỉ lưu
-- file gốc (mp4/webm/mov) và phát trực tiếp bằng thẻ <video> — trình duyệt
-- hiện đại phát tốt các định dạng này, không cần HLS/DASH ở quy mô này.
--
-- Chọn R2 thay vì Supabase Storage vì R2 KHÔNG TÍNH PHÍ BĂNG THÔNG TẢI RA
-- (egress). Video xem nhiều lần đốt băng thông rất nhanh — 20 học viên xem
-- 2 lần/tháng đã tốn 10.5GB egress, vượt gói Supabase Free ngay lập tức.
-- R2 free tier: 10GB lưu trữ + egress KHÔNG GIỚI HẠN.
--
-- GIỚI HẠN QUAN TRỌNG: 10GB free là CỐ ĐỊNH cho TOÀN HỆ THỐNG (mọi trung
-- tâm cộng lại), không phải mỗi org 10GB riêng — khác hẳn org_storage_usage
-- hiện có (mỗi org một hạn mức độc lập theo gói). Nên video có bảng quota
-- RIÊNG, không dùng chung org_storage_usage.
-- ════════════════════════════════════════════════════════════════════════════

-- ── org_video_usage: quota video riêng, tách khỏi quota tài liệu ────────────
--
-- Mỗi org có hạn mức video RIÊNG (vd 1-2GB), nhưng tổng của TẤT CẢ org
-- không được vượt trần hệ thống 10GB — kiểm cả hai điều kiện trong
-- check_video_quota() bên dưới.
CREATE TABLE IF NOT EXISTS org_video_usage (
  org_id      UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  bytes_used  BIGINT NOT NULL DEFAULT 0 CHECK (bytes_used >= 0),
  -- Hạn mức MỖI ORG trong tổng 10GB hệ thống. Mặc định 1GB — đủ cho khoảng
  -- 4-5 video 30 phút 720p mỗi trung tâm khi mới bắt đầu.
  bytes_limit BIGINT NOT NULL DEFAULT 1073741824,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS org_video_usage_updated_at ON org_video_usage;
CREATE TRIGGER org_video_usage_updated_at BEFORE UPDATE ON org_video_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE org_video_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON org_video_usage FROM anon;
GRANT SELECT ON org_video_usage TO authenticated;

-- Owner/GV xem được quota video của org mình (để biết còn upload được không)
DROP POLICY IF EXISTS org_video_usage_select ON org_video_usage;
CREATE POLICY org_video_usage_select ON org_video_usage
  FOR SELECT TO authenticated
  USING (public.is_org_staff(org_id));

-- ── Cột trên lesson_materials để phân biệt video R2 với video khác ─────────
-- (provider='r2' để sau này thêm provider khác — vd Cloudflare Stream trả
-- phí khi trung tâm cần transcode thật — mà không cần đổi schema nữa)
ALTER TABLE lesson_materials
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
    CHECK (duration_seconds IS NULL OR duration_seconds > 0);

COMMENT ON COLUMN lesson_materials.duration_seconds IS 'Thời lượng video (giây), chỉ dùng khi kind=video. NULL cho các loại khác.';

-- ── Hàm kiểm quota video: kiểm CẢ hạn mức org LẪN trần hệ thống ─────────────
CREATE OR REPLACE FUNCTION check_video_quota(p_org_id UUID, p_bytes BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_org_usage   org_video_usage;
  v_system_used BIGINT;
  -- Trần hệ thống: khớp SYSTEM_CAP_BYTES trong video-validation.js.
  -- Đặt hơi thấp hơn 10GB thật (9.5GB) để chừa khoảng đệm an toàn trước
  -- khi Cloudflare tính phí egress/lưu trữ vượt free tier.
  v_system_cap  CONSTANT BIGINT := 9500000000;
BEGIN
  SELECT * INTO v_org_usage FROM org_video_usage WHERE org_id = p_org_id;

  IF v_org_usage.org_id IS NULL THEN
    -- Org chưa có hàng usage → tạo với mặc định, coi như bytes_used = 0
    v_org_usage.bytes_used := 0;
    v_org_usage.bytes_limit := 1073741824; -- 1GB mặc định, khớp DEFAULT cột trên
  END IF;

  SELECT COALESCE(SUM(bytes_used), 0) INTO v_system_used FROM org_video_usage;

  RETURN jsonb_build_object(
    'allowed',
      (v_org_usage.bytes_used + p_bytes <= v_org_usage.bytes_limit)
      AND (v_system_used + p_bytes <= v_system_cap),
    'org_bytes_used', v_org_usage.bytes_used,
    'org_bytes_limit', v_org_usage.bytes_limit,
    'system_bytes_used', v_system_used,
    'system_bytes_cap', v_system_cap
  );
END $$;

REVOKE ALL ON FUNCTION check_video_quota(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_video_quota(UUID, BIGINT) TO authenticated, service_role;

-- ── Trigger cộng/trừ bytes_used khi video được thêm/xoá ─────────────────────
-- Video R2 nhận diện qua provider='r2' (storage_path KHÔNG dùng cho video
-- R2 vì blob không nằm trong Supabase Storage — dùng provider_id lưu R2 key).
CREATE OR REPLACE FUNCTION track_video_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.provider = 'r2' AND NEW.size_bytes IS NOT NULL THEN
    INSERT INTO org_video_usage (org_id, bytes_used)
    VALUES (NEW.org_id, NEW.size_bytes)
    ON CONFLICT (org_id) DO UPDATE
      SET bytes_used = org_video_usage.bytes_used + NEW.size_bytes;
  ELSIF TG_OP = 'DELETE' AND OLD.provider = 'r2' AND OLD.size_bytes IS NOT NULL THEN
    UPDATE org_video_usage
      SET bytes_used = GREATEST(0, bytes_used - OLD.size_bytes)
      WHERE org_id = OLD.org_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS lesson_materials_video_usage_tracking ON lesson_materials;
CREATE TRIGGER lesson_materials_video_usage_tracking
  AFTER INSERT OR DELETE ON lesson_materials
  FOR EACH ROW EXECUTE FUNCTION track_video_usage();

COMMENT ON TABLE org_video_usage IS 'Quota video RIÊNG khỏi org_storage_usage vì R2 free tier là 10GB CỐ ĐỊNH cho toàn hệ thống, không phải mỗi org một hạn mức độc lập. check_video_quota() kiểm cả hạn mức org lẫn trần hệ thống.';
COMMENT ON FUNCTION check_video_quota IS 'Kiểm quota video 2 lớp: (1) org không vượt bytes_limit riêng, (2) tổng hệ thống không vượt trần R2 free tier (9.5GB, chừa đệm dưới 10GB thật).';
