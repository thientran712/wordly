-- ════════════════════════════════════════════════════════════════════════════
-- Cache JWKS trong Postgres — sửa nguyên nhân chính khiến module B2B chậm
--
-- PHÁT HIỆN 7/9/2026: middleware gọi supabase.auth.getClaims() ở MỌI
-- request. Hàm này verify JWT bằng JWKS, nhưng cache JWKS nằm trong RAM
-- của GoTrueClient — trên Vercel serverless mỗi cold start tạo instance
-- MỚI nên cache RAM gần như luôn miss. Đo thực tế: mỗi request phải gọi
-- mạng tới /auth/v1/.well-known/jwks.json, mất 150-330ms.
--
-- Một trang B2B gọi 3-5 API song song, MỖI API tự trả giá network đó một
-- lần vì không chia sẻ gì với nhau — đây là lý do module trung tâm "rất
-- rất chậm" theo phản ánh của chủ dự án.
--
-- JWKS gần như KHÔNG BAO GIỜ đổi (chỉ đổi khi Supabase xoay khoá ký, rất
-- hiếm), nên cache 1 giờ là an toàn tuyệt đối.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS jwks_cache (
  id         TEXT PRIMARY KEY, -- luôn là 'default' — chỉ 1 hàng, 1 project Supabase = 1 JWKS
  jwks       JSONB NOT NULL,
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE jwks_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON jwks_cache FROM anon, authenticated;
-- Chỉ service_role đọc/ghi — đây là hạ tầng nội bộ, không phải dữ liệu
-- người dùng nào cần thấy qua client trực tiếp.

COMMENT ON TABLE jwks_cache IS 'Cache JWKS (public key ký JWT) dùng chung mọi serverless instance, để middleware không phải gọi mạng verify JWT ở mỗi request. TTL 1 giờ (JWKS gần như không đổi).';
