-- Wordly Pro: quyền Pro + lượt dùng theo ngày (spec 2026-10-16-pro-paywall-design.md §1, §3, §4, §8).
-- Server là nguồn sự thật cho quyền Pro và lượt dùng: app không tự quyết được
-- (app sửa được, server thì không). Mọi FK tới auth.users ON DELETE CASCADE.

BEGIN;

-- ── Quyền Pro: một dòng mỗi người ────────────────────────────────────────────
-- Chỉ service role ghi (route /api/billing/sync sau khi xác thực JWS của Apple,
-- webhook App Store Server Notifications) qua apply_entitlement bên dưới.
CREATE TABLE public.entitlements (
  user_id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source                  text NOT NULL CHECK (source IN ('app_store', 'gift')),
  product_id              text,
  -- UNIQUE: một thuê bao Apple chỉ gắn với MỘT tài khoản Wordly — không cho
  -- chuyển/nhân đôi gói sang tài khoản khác (chủ dự án yêu cầu, an toàn tiền).
  original_transaction_id text UNIQUE,
  -- NULL chỉ hợp lệ với gift (tặng vĩnh viễn); app_store luôn có hạn.
  expires_at              timestamptz,
  in_grace                boolean NOT NULL DEFAULT false,
  -- Hết ân hạn thanh toán (billing grace period) lúc nào — trong ân hạn vẫn Pro.
  grace_expires_at        timestamptz,
  -- Còn tự gia hạn không (NULL = chưa biết). App cảnh báo trước khi xoá tài
  -- khoản: xoá tài khoản KHÔNG huỷ thuê bao Apple.
  auto_renew              boolean,
  environment             text,
  -- Thời điểm Apple ký sự kiện đã áp dụng gần nhất: webhook có thể tới trễ /
  -- lặp / sai thứ tự — sự kiện cũ hơn không được đè trạng thái mới hơn.
  last_event_at           timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_expiry_shape CHECK (source = 'gift' OR expires_at IS NOT NULL)
);
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlements_select_own ON public.entitlements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Không có policy INSERT/UPDATE/DELETE: người dùng không tự cấp Pro được.

-- ── Lượt dùng theo ngày (giờ Việt Nam) ───────────────────────────────────────
CREATE TABLE public.usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('advanced_translate', 'dictionary')),
  count   integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, day, kind)
);
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_daily_select_own ON public.usage_daily
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Không policy ghi: chỉ consume_quota (SECURITY DEFINER) tăng bộ đếm.

-- ── Từ đã tra thẻ từ điển: tra lại không tính lượt ───────────────────────────
CREATE TABLE public.dictionary_lookups (
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word_key text NOT NULL CHECK (length(word_key) BETWEEN 1 AND 100),
  first_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, word_key)
);
ALTER TABLE public.dictionary_lookups ENABLE ROW LEVEL SECURITY;
CREATE POLICY dictionary_lookups_select_own ON public.dictionary_lookups
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Gộp lượt dịch theo câu đang soạn (quota_key) ─────────────────────────────
-- App dịch trực tiếp khi gõ/nói (debounce 300ms): một câu = nhiều request.
-- Trừ mỗi request thì một câu đốt hết 5 lượt. App gửi quota_key (UUID mỗi lần
-- soạn) → tối đa 1 lượt / (người, ngày VN, key); một key phủ tối đa 40 lượt
-- gọi thành công (chống dùng một key mãi), lượt thứ 41 trừ lượt mới.
CREATE TABLE public.translate_quota_keys (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day       date NOT NULL,
  quota_key uuid NOT NULL,
  calls     integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  PRIMARY KEY (user_id, day, quota_key)
);
ALTER TABLE public.translate_quota_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY translate_quota_keys_select_own ON public.translate_quota_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Không policy ghi: chỉ consume_quota ghi. Dòng ngày cũ vô hại (vài chục
-- byte/câu); dọn sau nếu cần.

-- Tra "từ đã biết" so khớp lower(word) trên kho từ — không có index thì mỗi
-- lượt tra quét cả bảng words.
CREATE INDEX IF NOT EXISTS words_lower_word_idx ON public.words (lower(word));

-- ── Pro hay không — bản JS: web/src/lib/billing/plan.js isPro (sửa cả hai) ───
-- Giờ SERVER (p_now), không bao giờ giờ của máy người dùng.
CREATE FUNCTION public.is_pro(p_user_id uuid, p_now timestamptz DEFAULT now())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM entitlements e
    WHERE e.user_id = p_user_id
      AND ((e.source = 'gift' AND e.expires_at IS NULL)
           OR e.expires_at > p_now
           OR (e.in_grace AND e.grace_expires_at > p_now))
  );
$$;
REVOKE ALL ON FUNCTION public.is_pro(uuid, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid, timestamptz) TO service_role;

-- Từ (đã chuẩn hoá: trim + lower) người này "đã biết" → tra thẻ từ điển miễn
-- phí (spec §8): đã tra trước đó, đã lưu (chưa xoá mềm), thuộc kho từ, hoặc
-- đã hiện cho người này trên widget/thông báo (suggestion_log).
CREATE FUNCTION public.is_known_word(p_user_id uuid, p_word_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT p_word_key IS NOT NULL AND (
    EXISTS (SELECT 1 FROM dictionary_lookups d WHERE d.user_id = p_user_id AND d.word_key = p_word_key)
    OR EXISTS (SELECT 1 FROM translate_history th
               WHERE th.user_id = p_user_id AND th.is_saved AND th.deleted_at IS NULL
                 AND lower(btrim(th.source_text)) = p_word_key)
    OR EXISTS (SELECT 1 FROM words w WHERE lower(w.word) = p_word_key)
    OR EXISTS (SELECT 1 FROM suggestion_log sl
               LEFT JOIN translate_history th ON th.id = sl.entry_id AND sl.entry_type = 'translate_history'
               LEFT JOIN words w ON w.id = sl.bank_word_id
               WHERE sl.user_id = p_user_id
                 AND (lower(btrim(th.source_text)) = p_word_key OR lower(w.word) = p_word_key))
  );
$$;
REVOKE ALL ON FUNCTION public.is_known_word(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_known_word(uuid, text) TO service_role;

-- ── Trừ lượt nguyên tử ───────────────────────────────────────────────────────
-- Ngày tính theo Asia/Ho_Chi_Minh (lượt về 0 lúc 0:00 giờ VN, spec §3).
-- INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit: hai request đồng
-- thời không thể cùng đọc ra số cũ rồi cùng vượt giới hạn.
-- p_limit NULL = không giới hạn (vẫn đếm). Gọi SAU khi tính năng thành công
-- (lỗi không trừ lượt) — route quyết định, hàm này chỉ đếm.
-- p_quota_key (chỉ advanced_translate): xem bảng translate_quota_keys.
-- Trả { allowed, used, remaining, free, charged }.
CREATE FUNCTION public.consume_quota(p_kind text, p_limit int, p_word_key text DEFAULT NULL, p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_day      date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_key      text := NULLIF(lower(btrim(p_word_key)), '');
  v_qkey     uuid := CASE WHEN p_kind = 'advanced_translate' THEN p_quota_key END;
  v_used     int;
  v_calls    int;
  v_inserted boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('advanced_translate', 'dictionary') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF p_limit IS NOT NULL AND p_limit < 0 THEN RAISE EXCEPTION 'invalid limit'; END IF;
  IF v_key IS NOT NULL AND length(v_key) > 100 THEN RAISE EXCEPTION 'invalid word key'; END IF;

  SELECT u.count INTO v_used FROM usage_daily u WHERE u.user_id = v_uid AND u.day = v_day AND u.kind = p_kind;
  v_used := COALESCE(v_used, 0);

  -- Từ đã biết: không trừ lượt
  IF p_kind = 'dictionary' AND is_known_word(v_uid, v_key) THEN
    RETURN jsonb_build_object('allowed', true, 'used', v_used, 'free', true, 'charged', false,
      'remaining', CASE WHEN p_limit IS NULL THEN NULL ELSE GREATEST(p_limit - v_used, 0) END);
  END IF;

  -- Câu đang soạn đã trừ hôm nay và còn trong 40 lượt gọi → không trừ thêm.
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
REVOKE ALL ON FUNCTION public.consume_quota(text, int, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_quota(text, int, text, uuid) TO authenticated;

-- Đọc lượt đã dùng hôm nay (giờ VN) + từ này đã biết chưa + câu đang soạn đã
-- trừ lượt chưa (key_active) — route kiểm TRƯỚC khi gọi AI (hết lượt thì
-- không đốt tiền AI, nhưng câu đã trừ thì không chặn giữa chừng),
-- /api/billing/status hiện bộ đếm.
CREATE FUNCTION public.usage_today(p_word_key text DEFAULT NULL, p_quota_key uuid DEFAULT NULL)
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
    'known_word', CASE WHEN v_key IS NULL THEN NULL ELSE is_known_word(v_uid, v_key) END,
    'key_active', CASE WHEN p_quota_key IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM translate_quota_keys k
      WHERE k.user_id = v_uid AND k.day = v_day AND k.quota_key = p_quota_key AND k.calls < 40) END
  );
END $$;
REVOKE ALL ON FUNCTION public.usage_today(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.usage_today(text, uuid) TO authenticated;

-- ── Ghi quyền Pro (chỉ service role) ─────────────────────────────────────────
-- Trả 'applied' | 'stale' (sự kiện cũ hơn cái đã áp dụng) | 'other_account'
-- (thuê bao này đã gắn tài khoản Wordly khác → KHÔNG chuyển, không nhân đôi).
-- Khoá dòng theo user + kiểm original_transaction_id trong cùng giao dịch nên
-- webhook và /api/billing/sync chạy đồng thời không ghi đè lẫn nhau.
CREATE FUNCTION public.apply_entitlement(
  p_user_id uuid, p_source text, p_product_id text, p_original_transaction_id text,
  p_expires_at timestamptz, p_in_grace boolean, p_grace_expires_at timestamptz,
  p_auto_renew boolean, p_environment text, p_event_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_owner uuid; v_last timestamptz;
BEGIN
  IF p_original_transaction_id IS NOT NULL THEN
    SELECT user_id INTO v_owner FROM entitlements WHERE original_transaction_id = p_original_transaction_id FOR UPDATE;
    IF v_owner IS NOT NULL AND v_owner <> p_user_id THEN RETURN 'other_account'; END IF;
  END IF;
  SELECT last_event_at INTO v_last FROM entitlements WHERE user_id = p_user_id FOR UPDATE;
  IF v_last IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_last THEN RETURN 'stale'; END IF;

  INSERT INTO entitlements AS e (user_id, source, product_id, original_transaction_id, expires_at,
                                 in_grace, grace_expires_at, auto_renew, environment, last_event_at, updated_at)
  VALUES (p_user_id, p_source, p_product_id, p_original_transaction_id, p_expires_at,
          COALESCE(p_in_grace, false), p_grace_expires_at, p_auto_renew, p_environment, p_event_at, now())
  ON CONFLICT (user_id) DO UPDATE SET
    source = EXCLUDED.source, product_id = EXCLUDED.product_id,
    original_transaction_id = EXCLUDED.original_transaction_id, expires_at = EXCLUDED.expires_at,
    in_grace = EXCLUDED.in_grace, grace_expires_at = EXCLUDED.grace_expires_at,
    auto_renew = EXCLUDED.auto_renew, environment = EXCLUDED.environment,
    last_event_at = COALESCE(EXCLUDED.last_event_at, e.last_event_at), updated_at = now();
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.apply_entitlement(uuid, text, text, text, timestamptz, boolean, timestamptz, boolean, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_entitlement(uuid, text, text, text, timestamptz, boolean, timestamptz, boolean, text, timestamptz) TO service_role;

-- ── Nhắc ôn: miễn phí chỉ gửi khung sớm nhất trong ngày (spec §3) ────────────
-- Thêm tham số p_free_one_slot (mặc định false = y như cũ) — cron chỉ bật khi
-- BILLING_ENFORCE. Dữ liệu khung giờ còn lại giữ nguyên, chỉ không gửi.
-- Bản JS: web/src/lib/push/due-push-slots-model.js (sửa cả hai).
DROP FUNCTION public.due_push_slots(timestamptz, int);
CREATE FUNCTION public.due_push_slots(p_now timestamptz DEFAULT now(), p_catchup_minutes int DEFAULT 30,
                                      p_free_one_slot boolean DEFAULT false)
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
      AND (NOT p_free_one_slot
           OR is_pro(s.user_id, p_now)
           OR s.send_time = (SELECT min(s2.send_time) FROM push_slots s2 WHERE s2.user_id = s.user_id AND s2.enabled))
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
REVOKE ALL ON FUNCTION public.due_push_slots(timestamptz, int, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_push_slots(timestamptz, int, boolean) TO service_role;

COMMIT;
