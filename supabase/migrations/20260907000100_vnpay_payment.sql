-- ════════════════════════════════════════════════════════════════════════════
-- GĐ3 — Thanh toán VNPay
--
-- Quyết định kiến trúc (đã chốt với chủ dự án):
--   • Mỗi trung tâm dùng tài khoản VNPay Merchant RIÊNG của họ — tiền về
--     thẳng TK của họ. Wordly KHÔNG chạm vào dòng tiền, không giữ tiền hộ
--     (tránh rủi ro pháp lý của việc làm cổng thanh toán trung gian).
--   • Hash Secret VNPay là bí mật CỰC KỲ nhạy cảm (dùng để ký/xác minh mọi
--     giao dịch) — lưu qua Supabase Vault (pgsodium), KHÔNG lưu plaintext.
--     Chỉ hàm SECURITY DEFINER mới giải mã được, kể cả owner qua UI cũng
--     không SELECT được giá trị thật.
-- ════════════════════════════════════════════════════════════════════════════

-- Vault dựa trên pgsodium, có sẵn trên mọi project Supabase.
CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;

-- ── org_payment_configs: credential VNPay theo từng org ─────────────────────
CREATE TABLE IF NOT EXISTS org_payment_configs (
  org_id           UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL DEFAULT 'vnpay' CHECK (provider = 'vnpay'),

  tmn_code         TEXT NOT NULL CHECK (length(trim(tmn_code)) BETWEEN 1 AND 50),
  -- Hash Secret KHÔNG lưu ở đây — lưu trong Vault, cột này chỉ giữ id
  -- tham chiếu tới secret (vault.secrets.id), xem set_vnpay_secret().
  hash_secret_id   UUID,

  -- 'sandbox' để test, 'production' khi trung tâm dùng tài khoản thật
  environment      TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  enabled          BOOLEAN NOT NULL DEFAULT false,

  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS org_payment_configs_updated_at ON org_payment_configs;
CREATE TRIGGER org_payment_configs_updated_at BEFORE UPDATE ON org_payment_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE org_payment_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON org_payment_configs FROM anon;
-- CHỈ SELECT metadata (tmn_code, environment, enabled) — KHÔNG bao giờ
-- select hash_secret_id ra client; RLS chỉ kiểm ai đọc được HÀNG, việc ẩn
-- CỘT secret nằm ở chỗ API không bao giờ trả field đó ra JSON.
GRANT SELECT, INSERT, UPDATE, DELETE ON org_payment_configs TO authenticated;

-- Chỉ owner cấu hình thanh toán — đây là thông tin tài chính nhạy cảm nhất
DROP POLICY IF EXISTS org_payment_configs_owner ON org_payment_configs;
CREATE POLICY org_payment_configs_owner ON org_payment_configs
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- ── Hàm lưu Hash Secret vào Vault (mã hoá) ──────────────────────────────────
-- SECURITY DEFINER vì INSERT vào vault.secrets cần quyền cao hơn owner
-- thường có. Owner gọi hàm này qua RPC, không bao giờ ghi thẳng vào bảng
-- vault.secrets.
CREATE OR REPLACE FUNCTION set_vnpay_secret(p_org_id UUID, p_hash_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
  v_secret_id UUID;
  v_old_id    UUID;
BEGIN
  -- Chỉ owner của CHÍNH org đó mới gọi được — kiểm tay vì SECURITY DEFINER
  -- bỏ qua RLS của bảng org_payment_configs.
  IF NOT public.is_org_owner(p_org_id) THEN
    RAISE EXCEPTION 'Không có quyền cấu hình thanh toán cho trung tâm này';
  END IF;

  IF p_hash_secret IS NULL OR length(trim(p_hash_secret)) < 8 THEN
    RAISE EXCEPTION 'Hash Secret không hợp lệ (tối thiểu 8 ký tự)';
  END IF;

  SELECT hash_secret_id INTO v_old_id FROM org_payment_configs WHERE org_id = p_org_id;

  -- Tạo secret mới trong Vault (tự mã hoá bằng pgsodium)
  v_secret_id := vault.create_secret(p_hash_secret, 'vnpay_hash_secret_' || p_org_id::text);

  UPDATE org_payment_configs SET hash_secret_id = v_secret_id WHERE org_id = p_org_id;

  -- Xoá secret cũ SAU khi đã cập nhật con trỏ mới — nếu xoá trước mà update
  -- lỗi thì mất luôn cả secret cũ lẫn mới.
  IF v_old_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_old_id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION set_vnpay_secret(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_vnpay_secret(UUID, TEXT) TO authenticated;

-- ── Hàm đọc Hash Secret đã giải mã (CHỈ dùng nội bộ, service_role) ──────────
-- KHÔNG grant cho `authenticated` — chỉ server (service_role key) gọi được,
-- khi cần ký/xác minh giao dịch. Client không bao giờ đọc được secret thật.
CREATE OR REPLACE FUNCTION get_vnpay_secret(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_catalog
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  -- Cột thật trong vault.decrypted_secrets tên là `secret` (đã kiểm chứng
  -- trên Supabase production 7/9/2026 qua information_schema.columns —
  -- KHÔNG phải `decrypted_secret` như tên view có thể gợi ý nhầm).
  SELECT secret INTO v_secret
  FROM vault.decrypted_secrets ds
  JOIN org_payment_configs c ON c.hash_secret_id = ds.id
  WHERE c.org_id = p_org_id;

  RETURN v_secret;
END $$;

REVOKE ALL ON FUNCTION get_vnpay_secret(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vnpay_secret(UUID) TO service_role;

-- ── vnpay_transactions: log mọi giao dịch để đối soát ───────────────────────
--
-- BẤT BIẾN như tuition_payments: chỉ INSERT/UPDATE trạng thái qua callback
-- đã xác minh chữ ký, không cho sửa tay. Đây là bằng chứng đối soát khi có
-- tranh chấp với VNPay hoặc học viên.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vnpay_txn_status') THEN
    CREATE TYPE vnpay_txn_status AS ENUM ('pending', 'success', 'failed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vnpay_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tuition_record_id  UUID NOT NULL REFERENCES tuition_records(id) ON DELETE CASCADE,

  -- vnp_TxnRef gửi cho VNPay — PHẢI duy nhất toàn hệ thống (VNPay yêu cầu),
  -- nên KHÔNG dùng UUID (dài, VNPay giới hạn 100 ký tự nhưng để gọn hơn
  -- dùng mã ngắn: {tuition_record_id 8 ký tự đầu}-{timestamp}).
  vnp_txn_ref        TEXT NOT NULL UNIQUE,

  amount             BIGINT NOT NULL CHECK (amount > 0),
  status             vnpay_txn_status NOT NULL DEFAULT 'pending',

  -- Lưu lại response đầy đủ từ VNPay để đối soát khi có tranh chấp
  vnp_response_code  TEXT,
  vnp_transaction_no TEXT,   -- mã giao dịch tại VNPay, dùng khi cần tra soát
  vnp_bank_code      TEXT,
  raw_response       JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vnpay_transactions_org_idx ON vnpay_transactions (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vnpay_transactions_tuition_idx ON vnpay_transactions (tuition_record_id);

-- ── Nhất quán tenant ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_vnpay_txn_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM tuition_records WHERE id = NEW.tuition_record_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Khoản học phí không tồn tại: %', NEW.tuition_record_id;
  END IF;
  NEW.org_id := v_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vnpay_transactions_tenant_check ON vnpay_transactions;
CREATE TRIGGER vnpay_transactions_tenant_check
  BEFORE INSERT ON vnpay_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_vnpay_txn_tenant();

-- ── Trigger: giao dịch THÀNH CÔNG tự động ghi vào tuition_payments ─────────
-- Đây là điểm nối quan trọng: một khi VNPay xác nhận thanh toán (qua IPN đã
-- xác minh chữ ký), khoản thu phải TỰ ĐỘNG phản ánh vào công nợ — không để
-- owner phải tự tay ghi nhận lại, dễ quên hoặc ghi trùng.
CREATE OR REPLACE FUNCTION record_vnpay_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'success' AND (OLD IS NULL OR OLD.status <> 'success') THEN
    INSERT INTO tuition_payments (tuition_record_id, org_id, amount, method, paid_at, reference, note)
    VALUES (
      NEW.tuition_record_id,
      NEW.org_id,
      NEW.amount,
      'ewallet',
      COALESCE(NEW.completed_at, now()),
      NEW.vnp_transaction_no,
      'Thanh toán qua VNPay, mã GD: ' || NEW.vnp_txn_ref
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vnpay_transactions_record_payment ON vnpay_transactions;
CREATE TRIGGER vnpay_transactions_record_payment
  AFTER INSERT OR UPDATE ON vnpay_transactions
  FOR EACH ROW EXECUTE FUNCTION record_vnpay_payment();

-- ── RLS cho vnpay_transactions ───────────────────────────────────────────────
ALTER TABLE vnpay_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON vnpay_transactions FROM anon;
-- Client KHÔNG được INSERT/UPDATE trực tiếp — mọi ghi nhận đi qua
-- service_role trong route callback (đã xác minh chữ ký VNPay trước).
GRANT SELECT ON vnpay_transactions TO authenticated;

DROP POLICY IF EXISTS vnpay_transactions_owner ON vnpay_transactions;
CREATE POLICY vnpay_transactions_owner ON vnpay_transactions
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id));

-- Học viên xem được giao dịch của khoản học phí CỦA MÌNH — minh bạch thanh toán
DROP POLICY IF EXISTS vnpay_transactions_select_self ON vnpay_transactions;
CREATE POLICY vnpay_transactions_select_self ON vnpay_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tuition_records r
      JOIN memberships m ON m.id = r.membership_id
      WHERE r.id = vnpay_transactions.tuition_record_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE org_payment_configs IS 'Credential VNPay theo từng org. Hash Secret lưu qua Supabase Vault (pgsodium), KHÔNG BAO GIỜ plaintext trong bảng này — chỉ hash_secret_id trỏ tới vault.secrets.';
COMMENT ON TABLE vnpay_transactions IS 'Log mọi giao dịch VNPay để đối soát. BẤT BIẾN qua client — chỉ route callback (đã xác minh chữ ký) mới ghi qua service_role. Trigger record_vnpay_payment tự tạo tuition_payments khi status=success.';
COMMENT ON FUNCTION set_vnpay_secret IS 'Owner gọi qua RPC để lưu Hash Secret — không bao giờ ghi thẳng vào bảng. Mã hoá tự động qua Vault.';
COMMENT ON FUNCTION get_vnpay_secret IS 'CHỈ service_role gọi được — giải mã Hash Secret để ký/xác minh giao dịch. Client không bao giờ đọc được.';
