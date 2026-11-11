-- Gói miễn phí: dịch bằng ảnh và bằng giọng nói mỗi loại 1 lượt/ngày, đếm riêng,
-- tách khỏi 5 lượt câu dài (chủ dự án chốt 11/11/2026). Chỉ thêm loại đếm mới —
-- không đổi dữ liệu cũ, app/server cũ vẫn chạy như trước.
--
-- 1. usage_daily nhận thêm kind 'image', 'voice' (giữ đủ các kind đang có).
-- 2. consume_quota nhận 'image', 'voice'; quota_key (một câu đang nói = nhiều
--    request) áp cho cả 'voice' như 'advanced_translate'.
-- 3. usage_today trả thêm image, voice.

ALTER TABLE public.usage_daily DROP CONSTRAINT usage_daily_kind_check;
ALTER TABLE public.usage_daily ADD CONSTRAINT usage_daily_kind_check
  CHECK (kind IN ('advanced_translate', 'dictionary', 'translate', 'ad_fallback', 'image', 'voice'));

CREATE OR REPLACE FUNCTION public.consume_quota(p_kind text, p_limit int, p_word_key text DEFAULT NULL, p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_day      date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_key      text := NULLIF(lower(btrim(p_word_key)), '');
  v_qkey     uuid := CASE WHEN p_kind IN ('advanced_translate', 'voice') THEN p_quota_key END;
  v_used     int;
  v_calls    int;
  v_inserted boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('advanced_translate', 'dictionary', 'image', 'voice') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'invalid limit'; END IF;
  IF v_key IS NOT NULL AND length(v_key) > 100 THEN RAISE EXCEPTION 'invalid word key'; END IF;

  SELECT u.count INTO v_used FROM usage_daily u WHERE u.user_id = v_uid AND u.day = v_day AND u.kind = p_kind;
  v_used := COALESCE(v_used, 0);

  -- Từ đã biết: không trừ lượt
  IF p_kind = 'dictionary' AND is_known_word(v_uid, v_key) THEN
    RETURN jsonb_build_object('allowed', true, 'used', v_used, 'free', true, 'charged', false,
      'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit - v_used, 0) END);
  END IF;

  -- Câu đang soạn / đang nói đã trừ hôm nay và còn trong 40 lượt gọi → không trừ thêm.
  -- INSERT giữ khoá dòng key: các request đồng thời cùng key xếp hàng ở đây
  -- nên chỉ một request trừ lượt.
  IF v_qkey IS NOT NULL THEN
    INSERT INTO translate_quota_keys AS k (user_id, day, quota_key, calls) VALUES (v_uid, v_day, v_qkey, 1)
    ON CONFLICT (user_id, day, quota_key) DO UPDATE SET calls = k.calls + 1 WHERE k.calls < 40
    RETURNING k.calls, (k.xmax = 0) INTO v_calls, v_inserted;
    IF v_calls IS NOT NULL AND NOT v_inserted THEN
      RETURN jsonb_build_object('allowed', true, 'used', v_used, 'free', false, 'charged', false,
        'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit - v_used, 0) END);
    END IF;
    -- Key mới (vừa chèn) hoặc đã đủ 40 lượt gọi → trừ một lượt mới bên dưới
  END IF;

  IF p_limit IS NOT NULL AND p_limit = 0 THEN
    v_used := NULL;
  ELSE
    INSERT INTO usage_daily AS u (user_id, day, kind, count) VALUES (v_uid, v_day, p_kind, 1)
    ON CONFLICT (user_id, day, kind) DO UPDATE SET count = u.count + 1
      WHERE p_limit IS NULL OR u.count < p_limit
    RETURNING u.count INTO v_used;
  END IF;

  IF v_used IS NULL THEN
    -- Hết lượt: key mới không được ghi (lần sau vẫn là "key mới" → vẫn chặn)
    IF v_qkey IS NOT NULL AND v_inserted THEN
      DELETE FROM translate_quota_keys WHERE user_id = v_uid AND day = v_day AND quota_key = v_qkey;
    END IF;
    SELECT u.count INTO v_used FROM usage_daily u WHERE u.user_id = v_uid AND u.day = v_day AND u.kind = p_kind;
    RETURN jsonb_build_object('allowed', false, 'used', COALESCE(v_used, 0), 'remaining', 0, 'free', false, 'charged', false);
  END IF;

  -- Key đã đủ 40 lượt gọi vừa được trừ lượt mới → đếm lại từ 1
  IF v_qkey IS NOT NULL AND v_calls IS NULL THEN
    UPDATE translate_quota_keys SET calls = 1 WHERE user_id = v_uid AND day = v_day AND quota_key = v_qkey;
  END IF;
  IF p_kind = 'dictionary' AND v_key IS NOT NULL THEN
    INSERT INTO dictionary_lookups (user_id, word_key) VALUES (v_uid, v_key) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'free', false, 'charged', true,
    'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit - v_used, 0) END);
END $$;

CREATE OR REPLACE FUNCTION public.usage_today(p_word_key text DEFAULT NULL, p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_key text := NULLIF(lower(btrim(p_word_key)), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN jsonb_build_object(
    'day', v_day,
    'advanced_translate', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'advanced_translate'), 0),
    'dictionary', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'dictionary'), 0),
    'image', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'image'), 0),
    'voice', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'voice'), 0),
    'known_word', CASE WHEN v_key IS NULL THEN NULL ELSE is_known_word(v_uid, v_key) END,
    'key_active', CASE WHEN p_quota_key IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM translate_quota_keys k
      WHERE k.user_id = v_uid AND k.day = v_day AND k.quota_key = p_quota_key AND k.calls < 40) END
  );
END $$;

NOTIFY pgrst, 'reload schema';
