-- Dashboard /admin (chủ dự án yêu cầu 16/10/2026): lịch sử server + số liệu bổ sung.
-- Chỉ thêm mới. server_status_log: watchdog ghi 5 phút/lần, giữ 8 ngày (route dọn).
BEGIN;

CREATE TABLE public.server_status_log (
  checked_at     timestamptz PRIMARY KEY DEFAULT now(),
  disk_pct       int NOT NULL,
  mem_mb         int NOT NULL,
  problems_count int NOT NULL DEFAULT 0
);
ALTER TABLE public.server_status_log ENABLE ROW LEVEL SECURITY;
-- Không có policy: chỉ service role.

CREATE FUNCTION public.admin_stats_extra(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
WITH d AS (SELECT (p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS t),
days AS (SELECT ts::date AS day FROM d, generate_series(d.t - 29, d.t, interval '1 day') ts),
saved AS (
  SELECT user_id, count(*) AS n FROM translate_history
  WHERE is_saved AND deleted_at IS NULL GROUP BY user_id
)
SELECT jsonb_build_object(
  -- 30 ngày gần nhất, tính cả hôm nay (đến giờ)
  'series30', (SELECT jsonb_agg(jsonb_build_object(
      'day', days.day,
      'active',     (SELECT count(*) FROM app_activity_daily a WHERE a.day = days.day),
      'new_users',  (SELECT count(*) FROM auth.users u WHERE (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.day),
      'saved',      (SELECT count(*) FROM translate_history h WHERE h.is_saved AND h.deleted_at IS NULL
                       AND (h.saved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.day),
      'quiz',       (SELECT count(*) FROM quiz_attempts q WHERE (q.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.day),
      'push_sent',  (SELECT count(*) FROM push_log l WHERE l.status = 'sent' AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = days.day),
      'limit_hits', (SELECT count(DISTINCT user_id) FROM usage_daily u WHERE u.day = days.day AND u.count >= 5)
    ) ORDER BY days.day) FROM days),
  -- Phễu kích hoạt trên toàn bộ tài khoản
  'funnel', jsonb_build_object(
    'signed_up',    (SELECT count(*) FROM auth.users),
    'saved_1',      (SELECT count(*) FROM saved WHERE n >= 1),
    'saved_5',      (SELECT count(*) FROM saved WHERE n >= 5),
    'widget_30d',   (SELECT count(DISTINCT user_id) FROM widget_schedule w WHERE w.shown_at > p_now - interval '30 days'),
    'push_enabled', (SELECT count(*) FROM push_preferences WHERE enabled),
    'pro_paid',     (SELECT count(*) FROM entitlements e WHERE e.environment = 'Production' AND is_pro(e.user_id, p_now))
  ),
  'providers', COALESCE((SELECT jsonb_agg(jsonb_build_object('provider', p, 'users', n) ORDER BY n DESC)
      FROM (SELECT COALESCE(raw_app_meta_data->>'provider', 'email') AS p, count(*) AS n FROM auth.users GROUP BY 1) x), '[]'::jsonb),
  'quiz', (SELECT jsonb_build_object('attempts_7d', count(*), 'avg_percent_7d', COALESCE(round(avg(percent)), 0))
      FROM quiz_attempts WHERE created_at > p_now - interval '7 days'),
  'push_health', jsonb_build_object(
    'sent_7d',   (SELECT count(*) FROM push_log WHERE status = 'sent' AND created_at > p_now - interval '7 days'),
    'failed_7d', (SELECT count(*) FROM push_log WHERE status <> 'sent' AND created_at > p_now - interval '7 days'),
    'devices',   (SELECT count(*) FROM push_devices)
  ),
  -- Từ (≤ 3 chữ) được lưu trong 7 ngày bởi ≥ 2 người — không lộ câu riêng của một người
  'top_words_7d', COALESCE((SELECT jsonb_agg(jsonb_build_object('word', w, 'users', n) ORDER BY n DESC, w)
      FROM (SELECT lower(trim(source_text)) AS w, count(DISTINCT user_id) AS n FROM translate_history
            WHERE is_saved AND deleted_at IS NULL AND saved_at > p_now - interval '7 days'
              AND array_length(regexp_split_to_array(trim(source_text), '\s+'), 1) <= 3
            GROUP BY 1 HAVING count(DISTINCT user_id) >= 2 ORDER BY 2 DESC, 1 LIMIT 10) x), '[]'::jsonb),
  -- Theo giờ, 7 ngày: ổ đĩa cao nhất, RAM còn thấp nhất trong giờ
  'server_history', COALESCE((SELECT jsonb_agg(jsonb_build_object('hour', h, 'disk_pct', disk, 'mem_mb', mem, 'problems', pr) ORDER BY h)
      FROM (SELECT date_trunc('hour', checked_at) AS h, max(disk_pct) AS disk, min(mem_mb) AS mem, max(problems_count) AS pr
            FROM server_status_log WHERE checked_at > p_now - interval '7 days' GROUP BY 1) x), '[]'::jsonb)
) FROM d;
$$;
REVOKE ALL ON FUNCTION public.admin_stats_extra(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats_extra(timestamptz) TO service_role;

COMMIT;
