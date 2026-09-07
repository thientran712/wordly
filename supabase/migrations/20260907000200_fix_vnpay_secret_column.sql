-- ════════════════════════════════════════════════════════════════════════════
-- SỬA LỖI: get_vnpay_secret() đọc nhầm cột, trả về chuỗi ĐÃ MÃ HOÁ
--
-- Lỗi trong migration 20260907000100: hàm đọc cột `secret` của view
-- vault.decrypted_secrets. View này có CẢ HAI cột:
--   secret            = chuỗi đã mã hoá (base64, KHÔNG dùng để ký được)
--   decrypted_secret  = giá trị thật đã giải mã  ← đúng cột cần dùng
--
-- Hậu quả nếu không sửa: mọi giao dịch VNPay sẽ ký bằng chuỗi mã hoá thay
-- vì Hash Secret thật → VNPay từ chối toàn bộ, và IPN không xác minh được
-- chữ ký nên KHÔNG giao dịch nào được ghi nhận. Lỗi im lặng, chỉ lộ ra khi
-- có giao dịch thật.
--
-- Phát hiện bằng thực nghiệm trên production 7/9/2026: lưu secret
-- "SELFTEST_SECRET_12345678" qua set_vnpay_secret() rồi đọc lại bằng
-- get_vnpay_secret() — nhận về "mqKi/8WbK3+zS4KiMG5hmJN58Z9H58Ngwlp7..."
-- thay vì giá trị gốc.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_vnpay_secret(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets ds
  JOIN org_payment_configs c ON c.hash_secret_id = ds.id
  WHERE c.org_id = p_org_id;

  RETURN v_secret;
END $$;

REVOKE ALL ON FUNCTION get_vnpay_secret(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vnpay_secret(UUID) TO service_role;

COMMENT ON FUNCTION get_vnpay_secret IS 'CHỈ service_role gọi được — giải mã Hash Secret để ký/xác minh giao dịch. Dùng cột decrypted_secret (KHÔNG phải `secret`, cột đó chứa chuỗi đã mã hoá).';
