-- Số liệu "hôm nay (đến giờ)" cho trang /admin tự tải lại (chủ dự án yêu cầu 16/10/2026,
-- spec 2026-10-16-admin-stats-design.md §6). Hàm riêng, không đụng admin_stats đang chạy.
BEGIN;

CREATE FUNCTION public.admin_stats_today(p_now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
WITH d AS (SELECT (p_now AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS t)
SELECT jsonb_build_object(
  'new_users',       (SELECT count(*) FROM auth.users u, d WHERE (u.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.t),
  'active',          (SELECT count(*) FROM app_activity_daily a, d WHERE a.day = d.t),
  'saved',           (SELECT count(*) FROM translate_history h, d WHERE h.is_saved AND h.deleted_at IS NULL
                        AND (h.saved_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.t),
  'quiz',            (SELECT count(*) FROM quiz_attempts q, d WHERE (q.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.t),
  'push_sent',       (SELECT count(*) FROM push_log l, d WHERE l.status = 'sent' AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = d.t),
  'advanced_used',   (SELECT COALESCE(sum(u.count), 0)::int FROM usage_daily u, d WHERE u.day = d.t AND u.kind = 'advanced_translate'),
  'dictionary_used', (SELECT COALESCE(sum(u.count), 0)::int FROM usage_daily u, d WHERE u.day = d.t AND u.kind = 'dictionary')
) FROM d;
$$;
REVOKE ALL ON FUNCTION public.admin_stats_today(timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats_today(timestamptz) TO service_role;

COMMIT;
