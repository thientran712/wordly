-- Đồng ý Điều khoản sử dụng + Chính sách quyền riêng tư (spec
-- docs/superpowers/specs/2026-10-15-terms-consent-design.md). Người dùng tự bấm
-- "Đồng ý" trong app → POST /api/consent ghi phiên bản + thời điểm (Nghị định
-- 13/2023 Điều 11: im lặng không phải đồng ý). NULL = chưa đồng ý (người dùng
-- tạo trước bản 1.0.1 sẽ được hỏi một lần).
-- RLS giữ nguyên: "Users can update own profile" (auth.uid() = id) đã đủ.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_version integer,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_terms_version_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_terms_version_check CHECK (terms_version IS NULL OR terms_version >= 1);

COMMIT;
