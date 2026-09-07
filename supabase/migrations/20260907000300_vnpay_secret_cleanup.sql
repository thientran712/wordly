-- ════════════════════════════════════════════════════════════════════════════
-- SỬA LỖI THIẾT KẾ: Hash Secret không được dọn khi xoá cấu hình
--
-- Lỗi trong 20260907000100: cột hash_secret_id chỉ là UUID thường, KHÔNG
-- có ràng buộc nào với vault.secrets. Nên khi:
--   • Owner xoá cấu hình thanh toán, hoặc
--   • Trung tâm bị xoá (org_payment_configs CASCADE theo organizations)
-- thì hàng cấu hình biến mất nhưng SECRET VẪN NẰM MÃI trong Vault.
--
-- Đây không chỉ là rác tích tụ mà là RỦI RO BẢO MẬT: Hash Secret của khách
-- hàng cũ (đã rời dịch vụ) tồn tại vô thời hạn trong database, không ai
-- biết để dọn vì không còn hàng nào trỏ tới nó.
--
-- Phát hiện 7/9/2026 khi dọn dữ liệu test: xoá hàng org_payment_configs
-- xong, query vault.secrets vẫn thấy secret còn nguyên.
--
-- KHÔNG dùng foreign key tới vault.secrets vì đó là schema hệ thống của
-- Supabase — thêm ràng buộc vào có thể vỡ khi Supabase nâng cấp Vault.
-- Dùng trigger thay thế: chủ động dọn, và bỏ qua lỗi nếu secret đã biến
-- mất (Vault có thể đã tự dọn theo cách khác).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_vnpay_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
BEGIN
  IF OLD.hash_secret_id IS NOT NULL THEN
    BEGIN
      DELETE FROM vault.secrets WHERE id = OLD.hash_secret_id;
    EXCEPTION WHEN OTHERS THEN
      -- Không để việc dọn secret chặn thao tác xoá cấu hình/xoá org.
      -- Thà còn một secret mồ côi còn hơn owner không xoá được cấu hình.
      RAISE WARNING 'Không dọn được vault secret %: %', OLD.hash_secret_id, SQLERRM;
    END;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS org_payment_configs_cleanup_secret ON org_payment_configs;
CREATE TRIGGER org_payment_configs_cleanup_secret
  AFTER DELETE ON org_payment_configs
  FOR EACH ROW EXECUTE FUNCTION cleanup_vnpay_secret();

COMMENT ON FUNCTION cleanup_vnpay_secret IS 'Dọn Hash Secret khỏi Vault khi cấu hình thanh toán bị xoá. Không dùng FK tới vault.secrets vì đó là schema hệ thống Supabase, ràng buộc có thể vỡ khi nâng cấp.';
