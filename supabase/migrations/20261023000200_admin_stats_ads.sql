-- Số liệu quảng cáo cho dashboard /admin (spec 2026-10-23-in-app-ads-design.md).
-- Hàm riêng (không sửa admin_stats_extra): khối lỗi thì dashboard vẫn hiện
-- phần còn lại. Ngày theo giờ Việt Nam. Chỉ service role.

BEGIN;

CREATE FUNCTION public.admin_stats_ads(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
WITH d AS (SELECT (p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today)
SELECT jsonb_build_object(
  'rewards_today', (SELECT count(*) FROM ad_rewards, d WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.today),
  'rewards_7d', (SELECT count(*) FROM ad_rewards, d WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date > d.today - 7),
  'fallback_today', (SELECT COALESCE(sum(count), 0) FROM usage_daily, d WHERE kind = 'ad_fallback' AND day = d.today),
  'theme_unlocks_total', (SELECT count(*) FROM theme_unlocks),
  'credits_outstanding', (SELECT COALESCE(sum(balance), 0) FROM ad_credits)
);
$$;
REVOKE ALL ON FUNCTION public.admin_stats_ads(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats_ads(timestamptz) TO service_role;

COMMIT;
