-- Dọn hệ quảng cáo thưởng cũ (PR #62 tạo ngày 23/10, code đã gỡ ở PR #65 ngày 25/10).
-- Chủ dự án chốt 14/11/2026. App giờ chỉ còn quảng cáo mở app (không dùng DB).
-- Đã kiểm production 14/11: cả 5 bảng 0 dòng, usage_daily không có dòng kind
-- 'translate'/'ad_fallback', không hàm/view/trigger/khoá ngoại nào khác trỏ tới.

DROP FUNCTION IF EXISTS public.translate_quota_today(uuid);
DROP FUNCTION IF EXISTS public.consume_translate(int, uuid);
DROP FUNCTION IF EXISTS public.grant_ad_fallback();
DROP FUNCTION IF EXISTS public.grant_ad_reward(text, uuid, text, text, int);
DROP FUNCTION IF EXISTS public.admin_stats_ads(timestamptz);
DROP FUNCTION IF EXISTS public.refund_translate(uuid);

DROP TABLE IF EXISTS public.translate_charges;
DROP TABLE IF EXISTS public.translate_ad_keys;
DROP TABLE IF EXISTS public.theme_unlocks;
DROP TABLE IF EXISTS public.ad_rewards;
DROP TABLE IF EXISTS public.ad_credits;

-- Chỉ còn các loại đếm đang dùng (consume_quota nhận đúng 4 loại này)
ALTER TABLE public.usage_daily DROP CONSTRAINT usage_daily_kind_check;
ALTER TABLE public.usage_daily ADD CONSTRAINT usage_daily_kind_check
  CHECK (kind IN ('advanced_translate', 'dictionary', 'image', 'voice'));

NOTIFY pgrst, 'reload schema';
