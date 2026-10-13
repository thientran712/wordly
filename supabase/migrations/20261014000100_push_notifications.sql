-- Push notification nhắc ôn từ (spec 2026-10-13). Mọi bảng bật RLS, mọi FK
-- tới auth.users ON DELETE CASCADE (xoá tài khoản tự dọn sạch).

BEGIN;

CREATE TABLE public.push_devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  app_version text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_idx ON public.push_devices (user_id);
CREATE INDEX push_devices_updated_idx ON public.push_devices (updated_at);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
-- Không có policy INSERT/UPDATE: chỉ ghi qua register_push_device (chống chiếm/rò token)
CREATE POLICY push_devices_select_own ON public.push_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY push_devices_delete_own ON public.push_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.push_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  frequency   text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'custom')),
  custom_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_preferences_own ON public.push_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.push_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  send_time  time NOT NULL CHECK (EXTRACT(minute FROM send_time) IN (0, 30) AND EXTRACT(second FROM send_time) = 0),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, send_time)
);
ALTER TABLE public.push_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_slots_own ON public.push_slots FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.push_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id    uuid NOT NULL REFERENCES public.push_slots(id) ON DELETE CASCADE,
  send_date  date NOT NULL,
  status     text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  entry_ids  jsonb,
  devices    integer,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, send_date) -- giành quyền gửi: hai lượt cron chồng nhau chỉ một lượt INSERT được
);
CREATE INDEX push_log_created_idx ON public.push_log (created_at);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY; -- không policy: chỉ service role

ALTER TABLE public.suggestion_log DROP CONSTRAINT suggestion_log_source_check;
ALTER TABLE public.suggestion_log ADD CONSTRAINT suggestion_log_source_check
  CHECK (source IN ('email', 'widget', 'push'));

-- Token thuộc về người đăng ký GẦN NHẤT: A đăng xuất lỗi, B đăng nhập cùng máy
-- → token chuyển sang B, thông báo của A không hiện trên máy B.
CREATE FUNCTION public.register_push_device(p_token text, p_platform text, p_app_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- Regex Postgres giới hạn lặp ≤ 255 → kiểm độ dài riêng
  IF p_token IS NULL OR length(p_token) NOT BETWEEN 100 AND 4096 OR p_token !~ '^[A-Za-z0-9:_-]+$' THEN
    RAISE EXCEPTION 'invalid token';
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'invalid platform'; END IF;
  INSERT INTO push_devices (user_id, token, platform, app_version)
  VALUES (auth.uid(), p_token, p_platform, left(p_app_version, 32))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated;

-- Slot cần gửi ngay bây giờ — bản JS: web/src/lib/push/due-push-slots-model.js
CREATE FUNCTION public.due_push_slots(p_now timestamptz DEFAULT now(), p_catchup_minutes int DEFAULT 30)
RETURNS TABLE (slot_id uuid, user_id uuid, send_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  WITH zones AS MATERIALIZED (SELECT name FROM pg_timezone_names),
  cand AS (
    SELECT s.id AS slot_id, s.user_id, s.send_time, pp.frequency, pp.custom_days,
           (p_now AT TIME ZONE COALESCE(z.name, 'Asia/Ho_Chi_Minh')) AS local_now
    FROM push_slots s
    JOIN push_preferences pp ON pp.user_id = s.user_id AND pp.enabled
    LEFT JOIN profiles pr ON pr.id = s.user_id
    LEFT JOIN zones z ON z.name = pr.timezone
    WHERE s.enabled
      AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = s.user_id)
  ),
  sched AS (
    SELECT c.slot_id, c.user_id, c.frequency, c.custom_days, c.local_now,
           v.d AS send_date, (v.d + c.send_time) AS local_due
    FROM cand c
    CROSS JOIN LATERAL (VALUES (c.local_now::date), (c.local_now::date - 1)) AS v(d)
  )
  SELECT sc.slot_id, sc.user_id, sc.send_date
  FROM sched sc
  WHERE sc.local_now >= sc.local_due
    AND sc.local_now < sc.local_due + make_interval(mins => p_catchup_minutes)
    AND (sc.frequency = 'daily'
         OR (sc.frequency = 'weekdays' AND EXTRACT(dow FROM sc.send_date) BETWEEN 1 AND 5)
         OR (sc.frequency = 'custom' AND EXTRACT(dow FROM sc.send_date)::int = ANY (sc.custom_days)))
    AND NOT EXISTS (SELECT 1 FROM push_log pl WHERE pl.slot_id = sc.slot_id AND pl.send_date = sc.send_date)
  ORDER BY (sc.local_now - sc.local_due) DESC, sc.slot_id;  -- trễ nhất gửi trước
$$;
REVOKE ALL ON FUNCTION public.due_push_slots(timestamptz, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_push_slots(timestamptz, int) TO service_role;

-- Dọn dần, giới hạn mỗi lượt để không khoá bảng lâu
CREATE FUNCTION public.cleanup_push_data(p_log_days int DEFAULT 30, p_device_days int DEFAULT 270, p_limit int DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_logs int; v_devices int;
BEGIN
  DELETE FROM push_log WHERE id IN (
    SELECT id FROM push_log WHERE created_at < now() - make_interval(days => p_log_days) LIMIT p_limit);
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM push_devices WHERE id IN (
    SELECT id FROM push_devices WHERE updated_at < now() - make_interval(days => p_device_days) LIMIT p_limit);
  GET DIAGNOSTICS v_devices = ROW_COUNT;
  RETURN jsonb_build_object('logs', v_logs, 'devices', v_devices);
END $$;
REVOKE ALL ON FUNCTION public.cleanup_push_data(int, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_data(int, int, int) TO service_role;

COMMIT;
