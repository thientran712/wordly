-- Thống kê cho chủ dự án + tình trạng server (spec 2026-10-16-admin-stats-design.md).
-- Chỉ thêm mới, không đụng bảng cũ. app_activity_daily: một dòng / người / ngày
-- (giờ VN), ghi qua touch_activity (chính người gọi). Không ai đọc thẳng — chỉ
-- admin_stats (service role) tổng hợp.
BEGIN;

CREATE TABLE public.app_activity_daily (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day      date NOT NULL,
  build    int,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX app_activity_daily_day_idx ON public.app_activity_daily (day);
ALTER TABLE public.app_activity_daily ENABLE ROW LEVEL SECURITY;
-- Không có policy: người dùng không SELECT/INSERT/UPDATE/DELETE thẳng được.

CREATE FUNCTION public.touch_activity(p_build int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO app_activity_daily AS a (user_id, day, build)
  VALUES (v_uid, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, p_build)
  ON CONFLICT (user_id, day) DO UPDATE
    SET last_at = now(),
        build = COALESCE(GREATEST(a.build, EXCLUDED.build), a.build, EXCLUDED.build);
END $$;
REVOKE ALL ON FUNCTION public.touch_activity(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.touch_activity(int) TO authenticated;

-- Tình trạng server do watchdog trên VPS gửi lên (một dòng duy nhất).
CREATE TABLE public.server_status (
  id         int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  disk_pct   int,
  mem_mb     int,
  problems   jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.server_status ENABLE ROW LEVEL SECURITY;

-- Tổng hợp. "Hôm qua" theo giờ VN: báo cáo gửi 8:00 sáng là số của ngày trọn vẹn.
CREATE FUNCTION public.admin_stats(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
WITH d AS (
  SELECT ((p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1) AS y,
         (SELECT min(day) FROM app_activity_daily) AS tracked_from
),
signup AS (
  SELECT u.id, (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day FROM auth.users u
),
saved AS (
  SELECT user_id, count(*) AS n FROM translate_history
  WHERE is_saved AND deleted_at IS NULL GROUP BY user_id
)
SELECT jsonb_build_object(
  'generated_at', p_now,
  'users', jsonb_build_object(
    'total',  (SELECT count(*) FROM signup),
    'new_1d', (SELECT count(*) FROM signup, d WHERE signup.day = d.y),
    'new_7d', (SELECT count(*) FROM signup, d WHERE signup.day BETWEEN d.y - 6 AND d.y),
    'new_30d',(SELECT count(*) FROM signup, d WHERE signup.day BETWEEN d.y - 29 AND d.y),
    'dau',    (SELECT count(DISTINCT user_id) FROM app_activity_daily a, d WHERE a.day = d.y),
    'wau',    (SELECT count(DISTINCT user_id) FROM app_activity_daily a, d WHERE a.day BETWEEN d.y - 5 AND d.y + 1),  -- 7 ngày tính cả hôm nay
    'mau',    (SELECT count(DISTINCT user_id) FROM app_activity_daily a, d WHERE a.day BETWEEN d.y - 28 AND d.y + 1)
  ),
  -- Chỉ tính nhóm đăng ký từ ngày bắt đầu ghi hoạt động (trước đó không có dữ liệu mở app)
  'retention', jsonb_build_object(
    'd1', (SELECT jsonb_build_object('cohort', count(*), 'returned',
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_activity_daily a WHERE a.user_id = s.id AND a.day = s.day + 1)))
           FROM signup s, d WHERE s.day BETWEEN d.y - 29 AND d.y - 1 AND s.day >= d.tracked_from),
    'd7', (SELECT jsonb_build_object('cohort', count(*), 'returned',
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM app_activity_daily a WHERE a.user_id = s.id AND a.day = s.day + 7)))
           FROM signup s, d WHERE s.day BETWEEN d.y - 36 AND d.y - 7 AND s.day >= d.tracked_from)
  ),
  'series', (SELECT jsonb_agg(jsonb_build_object(
               'day', g.day,
               'new_users', (SELECT count(*) FROM signup s WHERE s.day = g.day),
               'active', (SELECT count(*) FROM app_activity_daily a WHERE a.day = g.day)) ORDER BY g.day)
             FROM d, LATERAL (SELECT ts::date AS day FROM generate_series(d.y - 13, d.y, interval '1 day') ts) g),
  'features', jsonb_build_object(
    'saved_total',     (SELECT COALESCE(sum(n), 0) FROM saved),
    'savers',          (SELECT count(*) FROM saved),
    'saved_new_1d',    (SELECT count(*) FROM translate_history h, d WHERE h.is_saved AND h.deleted_at IS NULL
                          AND (h.saved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.y),
    'quiz_1d',         (SELECT count(*) FROM quiz_attempts q, d WHERE (q.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.y),
    'widget_users_7d', (SELECT count(DISTINCT user_id) FROM widget_schedule w WHERE w.shown_at BETWEEN p_now - interval '7 days' AND p_now),
    'push_enabled',    (SELECT count(*) FROM push_preferences WHERE enabled),
    'push_sent_1d',    (SELECT count(*) FROM push_log l, d WHERE l.status = 'sent' AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.y)
  ),
  'limits_yesterday', jsonb_build_object(
    'advanced_translate', (SELECT count(*) FROM usage_daily u, d WHERE u.day = d.y AND u.kind = 'advanced_translate' AND u.count >= 5),
    'dictionary',         (SELECT count(*) FROM usage_daily u, d WHERE u.day = d.y AND u.kind = 'dictionary' AND u.count >= 5),
    'saved_words',        (SELECT count(*) FROM saved WHERE n >= 30 AND NOT is_pro(saved.user_id, p_now))
  ),
  'pro', jsonb_build_object(
    'yearly',  (SELECT count(*) FROM entitlements e WHERE e.environment = 'Production' AND e.product_id = 'wordly.pro.yearly' AND is_pro(e.user_id, p_now)),
    'monthly', (SELECT count(*) FROM entitlements e WHERE e.environment = 'Production' AND e.product_id = 'wordly.pro.monthly' AND is_pro(e.user_id, p_now)),
    'sandbox', (SELECT count(*) FROM entitlements e WHERE e.environment = 'Sandbox' AND is_pro(e.user_id, p_now))
  ),
  'builds', COALESCE((SELECT jsonb_agg(jsonb_build_object('build', b.build, 'users', b.users) ORDER BY b.users DESC, b.build DESC NULLS LAST)
             FROM (SELECT last_build AS build, count(*) AS users FROM (
                     SELECT DISTINCT ON (user_id) user_id, build AS last_build FROM app_activity_daily
                     WHERE day >= (p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 6 ORDER BY user_id, day DESC) x
                   GROUP BY last_build) b), '[]'::jsonb),
  'server', (SELECT jsonb_build_object('disk_pct', disk_pct, 'mem_mb', mem_mb, 'problems', problems, 'checked_at', checked_at) FROM server_status WHERE id = 1)
) FROM d;
$$;
REVOKE ALL ON FUNCTION public.admin_stats(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats(timestamptz) TO service_role;

COMMIT;
