-- Quảng cáo trong app (spec 2026-10-23-in-app-ads-design.md): lượt dịch miễn
-- phí theo ngày, lượt thưởng xem quảng cáo (tích luỹ qua các ngày), theme mở
-- khoá bằng quảng cáo. Server là nguồn sự thật: app không tự cộng lượt được —
-- thưởng chỉ ghi qua service role sau khi xác thực SSV của AdMob.
-- Mọi FK tới auth.users ON DELETE CASCADE.

BEGIN;

-- ── Bộ đếm ngày: thêm lượt dịch thường + lượt thưởng dự phòng ───────────────
ALTER TABLE public.usage_daily DROP CONSTRAINT usage_daily_kind_check;
ALTER TABLE public.usage_daily ADD CONSTRAINT usage_daily_kind_check
  CHECK (kind IN ('advanced_translate', 'dictionary', 'translate', 'ad_fallback'));

-- ── Lượt thưởng còn lại (tích luỹ, không reset theo ngày) ───────────────────
CREATE TABLE public.ad_credits (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_credits_select_own ON public.ad_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- Không policy ghi: chỉ consume_translate / grant_* (SECURITY DEFINER) ghi.

-- ── Giao dịch thưởng đã áp dụng — khoá chống cộng trùng (SSV gửi lại) ───────
CREATE TABLE public.ad_rewards (
  transaction_id text PRIMARY KEY CHECK (length(transaction_id) BETWEEN 1 AND 200),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('translate', 'theme')),
  theme_id       text CHECK (theme_id IS NULL OR length(theme_id) BETWEEN 1 AND 64),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_rewards_user_idx ON public.ad_rewards (user_id, created_at DESC);
ALTER TABLE public.ad_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_rewards_select_own ON public.ad_rewards
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Theme đã mở khoá bằng quảng cáo ─────────────────────────────────────────
CREATE TABLE public.theme_unlocks (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_id    text NOT NULL CHECK (length(theme_id) BETWEEN 1 AND 64),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, theme_id)
);
ALTER TABLE public.theme_unlocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY theme_unlocks_select_own ON public.theme_unlocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Gộp lượt dịch theo câu đang soạn — tách khỏi translate_quota_keys ───────
-- Cùng quota_key app gửi cho cả consume_quota (dịch nâng cao) và
-- consume_translate: dùng chung bảng thì key consume_quota vừa chèn khiến
-- consume_translate tưởng "đã trừ" → dịch miễn phí mãi. Cùng luật 40 lượt gọi.
CREATE TABLE public.translate_ad_keys (
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day       date NOT NULL,
  quota_key uuid NOT NULL,
  calls     integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  PRIMARY KEY (user_id, day, quota_key)
);
ALTER TABLE public.translate_ad_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY translate_ad_keys_select_own ON public.translate_ad_keys
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ── Đọc lượt dịch hôm nay (giờ VN) — route kiểm TRƯỚC khi gọi AI ─────────────
-- used = lượt miễn phí đã dùng; credits = lượt thưởng còn; key_active = câu
-- đang soạn đã trừ lượt (không chặn giữa chừng).
CREATE FUNCTION public.translate_quota_today(p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN jsonb_build_object(
    'used', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'translate'), 0),
    'credits', COALESCE((SELECT balance FROM ad_credits WHERE user_id = v_uid), 0),
    'key_active', CASE WHEN p_quota_key IS NULL THEN NULL ELSE EXISTS (
      SELECT 1 FROM translate_ad_keys k
      WHERE k.user_id = v_uid AND k.day = v_day AND k.quota_key = p_quota_key AND k.calls < 40) END
  );
END $$;
REVOKE ALL ON FUNCTION public.translate_quota_today(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.translate_quota_today(uuid) TO authenticated;

-- ── Trừ một lượt dịch nguyên tử ──────────────────────────────────────────────
-- Thứ tự: câu đang soạn đã trừ → 'none'; còn lượt miễn phí hôm nay → 'free';
-- còn lượt thưởng → 'credit'; hết → allowed:false. Mỗi bước là một câu lệnh
-- có điều kiện trong WHERE nên request đồng thời không vượt giới hạn / số dư.
-- Gọi SAU khi dịch thành công (lỗi không trừ lượt).
CREATE FUNCTION public.consume_translate(p_daily_free int, p_quota_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_day      date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_used     int;
  v_credits  int;
  v_calls    int;
  v_inserted boolean;
  v_charged  text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_daily_free IS NULL OR p_daily_free < 0 THEN RAISE EXCEPTION 'invalid daily free'; END IF;

  IF p_quota_key IS NOT NULL THEN
    INSERT INTO translate_ad_keys AS k (user_id, day, quota_key, calls) VALUES (v_uid, v_day, p_quota_key, 1)
    ON CONFLICT (user_id, day, quota_key) DO UPDATE SET calls = k.calls + 1 WHERE k.calls < 40
    RETURNING k.calls, (k.xmax = 0) INTO v_calls, v_inserted;
    IF v_calls IS NOT NULL AND NOT v_inserted THEN
      RETURN jsonb_build_object('allowed', true, 'charged', 'none',
        'used', COALESCE((SELECT count FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'translate'), 0),
        'credits', COALESCE((SELECT balance FROM ad_credits WHERE user_id = v_uid), 0));
    END IF;
  END IF;

  IF p_daily_free > 0 THEN
    INSERT INTO usage_daily AS u (user_id, day, kind, count) VALUES (v_uid, v_day, 'translate', 1)
    ON CONFLICT (user_id, day, kind) DO UPDATE SET count = u.count + 1 WHERE u.count < p_daily_free
    RETURNING u.count INTO v_used;
  END IF;

  IF v_used IS NOT NULL THEN
    v_charged := 'free';
    SELECT balance INTO v_credits FROM ad_credits WHERE user_id = v_uid;
  ELSE
    UPDATE ad_credits SET balance = balance - 1, updated_at = now()
    WHERE user_id = v_uid AND balance > 0
    RETURNING balance INTO v_credits;
    IF v_credits IS NOT NULL THEN v_charged := 'credit'; END IF;
    SELECT count INTO v_used FROM usage_daily WHERE user_id = v_uid AND day = v_day AND kind = 'translate';
  END IF;

  IF v_charged IS NULL THEN
    -- Hết lượt: key mới không được ghi (lần sau vẫn là "key mới" → vẫn chặn)
    IF p_quota_key IS NOT NULL AND v_inserted THEN
      DELETE FROM translate_ad_keys WHERE user_id = v_uid AND day = v_day AND quota_key = p_quota_key;
    END IF;
    RETURN jsonb_build_object('allowed', false, 'charged', 'none', 'used', COALESCE(v_used, 0), 'credits', 0);
  END IF;

  -- Key đã đủ 40 lượt gọi vừa được trừ lượt mới → đếm lại từ 1
  IF p_quota_key IS NOT NULL AND v_calls IS NULL THEN
    UPDATE translate_ad_keys SET calls = 1 WHERE user_id = v_uid AND day = v_day AND quota_key = p_quota_key;
  END IF;
  RETURN jsonb_build_object('allowed', true, 'charged', v_charged,
    'used', COALESCE(v_used, 0), 'credits', COALESCE(v_credits, 0));
END $$;
REVOKE ALL ON FUNCTION public.consume_translate(int, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_translate(int, uuid) TO authenticated;

-- ── Thưởng dự phòng khi SSV chưa tới / lỗi: tối đa 5 lượt mỗi ngày ───────────
CREATE FUNCTION public.grant_ad_fallback()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_day     date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_n       int;
  v_credits int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO usage_daily AS u (user_id, day, kind, count) VALUES (v_uid, v_day, 'ad_fallback', 1)
  ON CONFLICT (user_id, day, kind) DO UPDATE SET count = u.count + 1 WHERE u.count < 5
  RETURNING u.count INTO v_n;
  IF v_n IS NULL THEN
    RETURN jsonb_build_object('granted', false,
      'credits', COALESCE((SELECT balance FROM ad_credits WHERE user_id = v_uid), 0));
  END IF;
  INSERT INTO ad_credits AS c (user_id, balance) VALUES (v_uid, 1)
  ON CONFLICT (user_id) DO UPDATE SET balance = c.balance + 1, updated_at = now()
  RETURNING c.balance INTO v_credits;
  RETURN jsonb_build_object('granted', true, 'credits', v_credits);
END $$;
REVOKE ALL ON FUNCTION public.grant_ad_fallback() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_ad_fallback() TO authenticated;

-- ── Áp dụng thưởng đã xác thực SSV (chỉ service role) ───────────────────────
-- Trả 'applied' | 'duplicate'. Chèn ad_rewards trước: transaction_id là khoá
-- chính nên callback lặp/đồng thời chỉ một lần được cộng.
CREATE FUNCTION public.grant_ad_reward(p_transaction_id text, p_user_id uuid, p_kind text,
                                       p_theme_id text, p_credits int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_tx text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('translate', 'theme') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  IF p_kind = 'translate' AND (p_credits IS NULL OR p_credits <= 0) THEN RAISE EXCEPTION 'invalid credits'; END IF;
  IF p_kind = 'theme' AND p_theme_id IS NULL THEN RAISE EXCEPTION 'missing theme'; END IF;

  INSERT INTO ad_rewards (transaction_id, user_id, kind, theme_id)
  VALUES (p_transaction_id, p_user_id, p_kind, CASE WHEN p_kind = 'theme' THEN p_theme_id END)
  ON CONFLICT (transaction_id) DO NOTHING
  RETURNING transaction_id INTO v_tx;
  IF v_tx IS NULL THEN RETURN 'duplicate'; END IF;

  IF p_kind = 'translate' THEN
    INSERT INTO ad_credits AS c (user_id, balance) VALUES (p_user_id, p_credits)
    ON CONFLICT (user_id) DO UPDATE SET balance = c.balance + p_credits, updated_at = now();
  ELSE
    INSERT INTO theme_unlocks (user_id, theme_id) VALUES (p_user_id, p_theme_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN 'applied';
END $$;
REVOKE ALL ON FUNCTION public.grant_ad_reward(text, uuid, text, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_ad_reward(text, uuid, text, text, int) TO service_role;

COMMIT;
