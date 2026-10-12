-- ════════════════════════════════════════════════════════════════════════════
-- Cache bản dịch BỀN cho /api/translate (theo CÂU)
--
-- VÌ SAO CẦN: trước đây cache duy nhất là LRU trong RAM của container web →
-- mỗi lần deploy là mất sạch, câu phổ biến lại phải trả tiền dịch (DeepL
-- ~$25/1 triệu ký tự). Bảng này giữ bản dịch qua các lần deploy. LRU trong
-- RAM vẫn là tầng thứ nhất đứng trước bảng này.
--
-- Mỗi hàng là MỘT câu (hoặc một từ/cụm ngắn), không phải cả đoạn — client
-- dịch khi đang gõ, cache theo câu thì chỉ câu đang gõ dở là mới.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS translation_cache (
  -- sha256 hex của '<source>><target>:<văn bản đã chuẩn hoá>'
  -- (xem persistentCacheKey trong web/src/lib/translate/translate-routing.js)
  key              text PRIMARY KEY,
  source           text NOT NULL CHECK (source IN ('EN', 'VI')),
  target           text NOT NULL CHECK (target IN ('EN', 'VI')),
  source_text      text NOT NULL,
  translated_text  text NOT NULL,
  -- Nhà dịch đã tạo bản dịch — để sau này đánh giá/xoá riêng theo engine
  engine           text NOT NULL CHECK (engine IN ('deepl', 'gemini')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Cho job dọn theo tuổi (chưa có job — bảng chỉ có câu đã dịch, lớn chậm)
CREATE INDEX IF NOT EXISTS translation_cache_created_at_idx
  ON translation_cache (created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Đọc/ghi CHỈ qua server bằng service_role (createAdminClient trong
-- /api/translate), giống cách /api/dictionary dùng word_dictionary_cache.
--
-- KHÁC word_dictionary_cache ở một điểm có chủ ý: bảng đó có policy cho
-- authenticated SELECT vì nội dung chỉ là định nghĩa từ điển công khai. Ở
-- đây source_text là câu NGƯỜI DÙNG gõ (có thể chứa tên, địa chỉ, nội dung
-- riêng tư) → KHÔNG mở cho anon/authenticated, nếu không người dùng này đọc
-- được câu của người dùng khác qua PostgREST.
ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON translation_cache FROM anon, authenticated;

CREATE POLICY "service write translation cache" ON translation_cache
  TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON TABLE translation_cache TO service_role;
