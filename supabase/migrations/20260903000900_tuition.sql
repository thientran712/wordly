-- ════════════════════════════════════════════════════════════════════════════
-- GĐ4 — Quản lý học phí & công nợ
--
-- Nghiệp vụ TÀI CHÍNH nên thiết kế thận trọng hơn các bảng khác:
--   • Số tiền là BIGINT đồng (VND không có đơn vị nhỏ hơn) — KHÔNG dùng
--     float vì phép cộng float làm sai số tiền
--   • Bản ghi thanh toán KHÔNG cho sửa/xoá (chỉ INSERT) — sổ sách tài chính
--     phải bất biến; nhập sai thì ghi phiếu điều chỉnh, không sửa lịch sử
--   • Chỉ owner truy cập — giáo viên không được xem học phí
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tuition_model') THEN
    CREATE TYPE tuition_model AS ENUM ('per_course', 'per_session', 'per_month');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'card', 'ewallet', 'other');
  END IF;
END $$;

-- ── tuition_records: khoản học phí của một học viên ─────────────────────────
CREATE TABLE IF NOT EXISTS tuition_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  -- Học phí thường gắn với một lớp, nhưng có thể là khoản chung của trung tâm
  class_id      UUID REFERENCES classes(id) ON DELETE SET NULL,

  title         TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 300),
  model         tuition_model NOT NULL,

  -- Tham số tính tiền, lưu lại để về sau còn giải thích được con số
  unit_fee      BIGINT NOT NULL DEFAULT 0 CHECK (unit_fee >= 0),
  unit_count    INTEGER NOT NULL DEFAULT 1 CHECK (unit_count >= 0),

  subtotal        BIGINT NOT NULL CHECK (subtotal >= 0),
  discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_due       BIGINT NOT NULL CHECK (total_due >= 0),

  due_date      DATE,
  note          TEXT,

  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Giảm giá không được vượt tạm tính
  CONSTRAINT tuition_discount_lte_subtotal CHECK (discount_amount <= subtotal),
  -- Tổng phải khớp: đây là bất biến quan trọng nhất của bảng này
  CONSTRAINT tuition_total_matches CHECK (total_due = subtotal - discount_amount)
);

CREATE INDEX IF NOT EXISTS tuition_records_org_idx ON tuition_records (org_id, due_date);
CREATE INDEX IF NOT EXISTS tuition_records_membership_idx ON tuition_records (membership_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tuition_records_class_idx ON tuition_records (class_id) WHERE class_id IS NOT NULL;

DROP TRIGGER IF EXISTS tuition_records_updated_at ON tuition_records;
CREATE TRIGGER tuition_records_updated_at BEFORE UPDATE ON tuition_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── tuition_payments: các lần đóng tiền ────────────────────────────────────
-- BẤT BIẾN: chỉ INSERT, không UPDATE/DELETE. Sổ sách tài chính phải giữ
-- nguyên lịch sử; nhập sai thì ghi thêm phiếu điều chỉnh.
CREATE TABLE IF NOT EXISTS tuition_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tuition_record_id  UUID NOT NULL REFERENCES tuition_records(id) ON DELETE CASCADE,
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  amount        BIGINT NOT NULL CHECK (amount > 0),
  method        payment_method NOT NULL DEFAULT 'cash',
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference     TEXT,   -- mã giao dịch / số phiếu thu
  note          TEXT,

  recorded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tuition_payments_record_idx ON tuition_payments (tuition_record_id, paid_at);
CREATE INDEX IF NOT EXISTS tuition_payments_org_idx ON tuition_payments (org_id, paid_at DESC);

-- ── Nhất quán tenant ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_tuition_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_mem_org   UUID;
  v_class_org UUID;
BEGIN
  SELECT org_id INTO v_mem_org FROM memberships WHERE id = NEW.membership_id;
  IF v_mem_org IS NULL THEN
    RAISE EXCEPTION 'Thành viên không tồn tại: %', NEW.membership_id;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT org_id INTO v_class_org FROM classes WHERE id = NEW.class_id;
    IF v_class_org IS NULL OR v_class_org <> v_mem_org THEN
      RAISE EXCEPTION 'Vi phạm cô lập tenant: lớp và học viên không cùng trung tâm';
    END IF;
  END IF;

  NEW.org_id := v_mem_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tuition_records_tenant_check ON tuition_records;
CREATE TRIGGER tuition_records_tenant_check
  BEFORE INSERT OR UPDATE ON tuition_records
  FOR EACH ROW EXECUTE FUNCTION enforce_tuition_tenant();

CREATE OR REPLACE FUNCTION enforce_payment_tenant()
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

DROP TRIGGER IF EXISTS tuition_payments_tenant_check ON tuition_payments;
CREATE TRIGGER tuition_payments_tenant_check
  BEFORE INSERT ON tuition_payments
  FOR EACH ROW EXECUTE FUNCTION enforce_payment_tenant();

-- ── View công nợ ────────────────────────────────────────────────────────────
-- Tính ở DB để mọi nơi (API, báo cáo, xuất Excel) dùng cùng một con số.
CREATE OR REPLACE VIEW tuition_balances AS
SELECT
  r.id                AS tuition_record_id,
  r.org_id,
  r.membership_id,
  r.class_id,
  r.title,
  r.total_due,
  r.due_date,
  COALESCE(SUM(p.amount), 0)                                  AS paid,
  GREATEST(0, r.total_due - COALESCE(SUM(p.amount), 0))       AS outstanding,
  GREATEST(0, COALESCE(SUM(p.amount), 0) - r.total_due)       AS overpaid,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) >= r.total_due THEN 'paid'
    WHEN COALESCE(SUM(p.amount), 0) > 0            THEN 'partial'
    ELSE 'unpaid'
  END                                                          AS status,
  (r.due_date IS NOT NULL
    AND r.due_date < CURRENT_DATE
    AND COALESCE(SUM(p.amount), 0) < r.total_due)              AS is_overdue
FROM tuition_records r
LEFT JOIN tuition_payments p ON p.tuition_record_id = r.id
GROUP BY r.id, r.org_id, r.membership_id, r.class_id, r.title, r.total_due, r.due_date;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE tuition_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuition_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON tuition_records  FROM anon;
REVOKE ALL ON tuition_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON tuition_records  TO authenticated;
-- payments: KHÔNG grant UPDATE/DELETE — sổ sách bất biến
GRANT SELECT, INSERT                 ON tuition_payments TO authenticated;
GRANT SELECT ON tuition_balances TO authenticated;

-- Học phí CHỈ owner xem/sửa. Giáo viên KHÔNG được xem tiền.
DROP POLICY IF EXISTS tuition_records_owner ON tuition_records;
CREATE POLICY tuition_records_owner ON tuition_records
  FOR ALL TO authenticated
  USING (public.is_org_owner(org_id))
  WITH CHECK (public.is_org_owner(org_id));

-- Học viên và phụ huynh xem được khoản CỦA MÌNH / của con mình.
-- Minh bạch học phí là yêu cầu chính đáng của người đóng tiền.
DROP POLICY IF EXISTS tuition_records_select_self ON tuition_records;
CREATE POLICY tuition_records_select_self ON tuition_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = tuition_records.membership_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tuition_payments_owner ON tuition_payments;
CREATE POLICY tuition_payments_owner ON tuition_payments
  FOR SELECT TO authenticated
  USING (public.is_org_owner(org_id));

DROP POLICY IF EXISTS tuition_payments_insert_owner ON tuition_payments;
CREATE POLICY tuition_payments_insert_owner ON tuition_payments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_owner(org_id));

DROP POLICY IF EXISTS tuition_payments_select_self ON tuition_payments;
CREATE POLICY tuition_payments_select_self ON tuition_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tuition_records r
      JOIN memberships m ON m.id = r.membership_id
      WHERE r.id = tuition_payments.tuition_record_id AND m.user_id = auth.uid()
    )
  );

COMMENT ON TABLE tuition_records IS 'Khoản học phí. Số tiền là BIGINT đồng (không dùng float — cộng float làm sai tiền). CHECK bảo đảm total_due = subtotal - discount.';
COMMENT ON TABLE tuition_payments IS 'Lần đóng tiền. BẤT BIẾN: chỉ INSERT, không UPDATE/DELETE — sổ sách tài chính phải giữ nguyên lịch sử. Nhập sai thì ghi phiếu điều chỉnh.';
COMMENT ON VIEW tuition_balances IS 'Công nợ tính ở DB để API, báo cáo và xuất Excel dùng cùng một con số.';
