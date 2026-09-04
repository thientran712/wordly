-- ════════════════════════════════════════════════════════════════════════════
-- Bộ đếm rate limit DÙNG CHUNG giữa các instance
--
-- VÌ SAO CẦN: rate limit đếm trong bộ nhớ tiến trình KHÔNG hoạt động trên
-- Vercel. Đã kiểm chứng trên production 4/9/2026: gọi /api/dictionary 18 lần
-- với giới hạn 15/phút → 0 lần bị chặn. Nguyên nhân: 6 lần gọi liên tiếp
-- được 6 instance khác nhau phục vụ, mỗi instance đếm riêng.
--
-- Bảng này cho mọi instance dùng chung một bộ đếm.
--
-- Dùng KHUNG CỐ ĐỊNH (fixed window): chỉ cần 1 lượt ghi mỗi request. Cửa sổ
-- trượt chính xác hơn nhưng phải lưu từng timestamp — đắt hơn nhiều mà mục
-- tiêu ở đây chỉ là chặn đốt quota AI.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  -- '<scope>:<ip hoặc user id>' — tách hạn mức theo từng route VÀ từng người
  bucket_key    VARCHAR(200) NOT NULL,
  -- Mốc đầu khung, luôn chia hết cho window_ms để mọi instance tính ra
  -- CÙNG một giá trị (nếu lệch thì chúng lại đếm riêng, lỗi cũ lặp lại)
  window_start  TIMESTAMPTZ  NOT NULL,
  hits          INTEGER      NOT NULL DEFAULT 0,
  -- Thời điểm hàng này hết giá trị, dùng cho job dọn
  expires_at    TIMESTAMPTZ  NOT NULL,

  PRIMARY KEY (bucket_key, window_start)
);

-- Index cho job dọn hàng hết hạn
CREATE INDEX IF NOT EXISTS rate_limit_counters_expiry_idx
  ON rate_limit_counters (expires_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Bảng này KHÔNG dành cho client. Chỉ hàm SECURITY DEFINER bên dưới ghi được.
-- Bật RLS mà không tạo policy nào = chặn hết mọi truy cập trực tiếp.
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_counters FROM anon, authenticated;

-- ── Hàm tăng bộ đếm — PHẢI atomic ───────────────────────────────────────────
--
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING là atomic ở tầng Postgres:
-- hai request đồng thời KHÔNG THỂ cùng đọc ra số cũ rồi cùng ghi số cũ+1.
-- Nếu viết thành SELECT rồi UPDATE thì sẽ có race condition và giới hạn bị
-- vượt khi có nhiều request cùng lúc — đúng lúc cần nó nhất.
--
-- SECURITY DEFINER để chạy được dù RLS chặn mọi truy cập trực tiếp.
CREATE OR REPLACE FUNCTION bump_rate_limit(
  p_bucket_key   VARCHAR(200),
  p_window_start TIMESTAMPTZ,
  p_window_ms    INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path cố định: chặn tấn công qua schema do người gọi kiểm soát
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hits INTEGER;
BEGIN
  -- Chặn tham số vô lý (window quá dài giữ rác lâu, quá ngắn thành vô dụng)
  IF p_window_ms IS NULL OR p_window_ms < 1000 OR p_window_ms > 86400000 THEN
    RAISE EXCEPTION 'window_ms không hợp lệ: %', p_window_ms;
  END IF;

  INSERT INTO rate_limit_counters (bucket_key, window_start, hits, expires_at)
  VALUES (
    p_bucket_key,
    p_window_start,
    1,
    -- Giữ thêm 1 khung để job dọn không xoá hàng đang dùng
    p_window_start + (p_window_ms * 2) * INTERVAL '1 millisecond'
  )
  ON CONFLICT (bucket_key, window_start) DO UPDATE
    SET hits = rate_limit_counters.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits;
END $$;

REVOKE ALL ON FUNCTION bump_rate_limit(VARCHAR, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bump_rate_limit(VARCHAR, TIMESTAMPTZ, INTEGER) TO anon, authenticated, service_role;

-- ── Hàm dọn hàng hết hạn ────────────────────────────────────────────────────
-- Không dọn thì bảng phình vô hạn: mỗi IP mỗi phút một hàng.
CREATE OR REPLACE FUNCTION cleanup_rate_limit_counters()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limit_counters WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION cleanup_rate_limit_counters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_rate_limit_counters() TO service_role;

COMMENT ON TABLE rate_limit_counters IS 'Bộ đếm rate limit dùng chung giữa các instance Vercel. Bản đếm trong RAM không hoạt động vì mỗi request có thể vào instance khác nhau (đã kiểm chứng trên production 4/9/2026).';
COMMENT ON FUNCTION bump_rate_limit IS 'Tăng bộ đếm và trả về số lượt trong khung. INSERT..ON CONFLICT..RETURNING là atomic — không có race condition khi nhiều request đồng thời.';
